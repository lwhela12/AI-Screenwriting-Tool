#!/bin/bash
# Build a distributable, Developer ID signed and notarized Pica DMG.
#
# This script deliberately never installs Pica, deletes another build, or reads
# credentials.  `notarytool` receives an existing Keychain profile by name.
set -euo pipefail

INVOCATION_DIR="$(pwd -P)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RELEASE_ROOT="$SCRIPT_DIR/.build/releases"
APP_NAME="Pica.app"
POLL_SECONDS="${PICA_NOTARY_POLL_SECONDS:-20}"
POLL_LIMIT="${PICA_NOTARY_POLL_LIMIT:-15}"
DMG_FILE="Pica.dmg"

usage() {
  cat <<'EOF'
Usage:
  ./release-app.sh --prepare
  ./release-app.sh --release --identity "Developer ID Application: ..." --notary-profile PROFILE
  ./release-app.sh --submit --identity "Developer ID Application: ..." --notary-profile PROFILE
  ./release-app.sh --finish RELEASE_DIRECTORY --notary-profile PROFILE

--prepare creates an explicitly UNNOTARIZED preview DMG. It is for local
review only and must not be distributed as a signed release.

--release builds, signs, submits, waits for acceptance, staples, and verifies.
--submit does the same through submission, then exits and records the submission
ID. Use --finish to resume that release directory without uploading again.

The Developer ID Application identity must be present in the login keychain.
The notary profile is a Keychain item created with `xcrun notarytool store-
credentials`; no Apple ID password or app-specific password is accepted here.
EOF
}

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

json_field() {
  local field="$1"
  node -e 'let input=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { try { const value = JSON.parse(input)[process.argv[1]]; if (typeof value === "string") process.stdout.write(value); } catch (_) { process.exitCode = 1; } });' "$field"
}

MODE=""
IDENTITY=""
NOTARY_PROFILE=""
RELEASE_DIR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prepare|--release|--submit) [ -z "$MODE" ] || die "choose one mode"; MODE="${1#--}" ;;
    --finish)
      [ -z "$MODE" ] || die "choose one mode"
      MODE="finish"
      shift
      [ "$#" -gt 0 ] || die "--finish requires RELEASE_DIRECTORY"
      case "$1" in
        /*) RELEASE_DIR="$1" ;;
        *) RELEASE_DIR="$INVOCATION_DIR/$1" ;;
      esac
      ;;
    --identity) shift; [ "$#" -gt 0 ] || die "--identity requires a value"; IDENTITY="$1" ;;
    --notary-profile) shift; [ "$#" -gt 0 ] || die "--notary-profile requires a value"; NOTARY_PROFILE="$1" ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
[ -n "$MODE" ] || { usage >&2; exit 2; }

need xcodebuild
need xcrun
need codesign
need hdiutil
need lipo
need shasum
need node
need file
need spctl
need /usr/libexec/PlistBuddy

require_notary_profile() {
  [ -n "$NOTARY_PROFILE" ] || die "--notary-profile is required"
  # Let Apple's client retrieve the named Keychain profile and authenticate it.
  # Keychain item service/account names are implementation details, so querying
  # them directly would reject valid profiles on some Xcode versions.
  xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" --output-format json >/dev/null || \
    die "notary profile '$NOTARY_PROFILE' could not authenticate; run 'xcrun notarytool store-credentials $NOTARY_PROFILE'"
}

require_identity() {
  [ -n "$IDENTITY" ] || die "--identity is required"
  printf '%s\n' "$IDENTITY" | grep -q '^Developer ID Application:' || \
    die "identity must begin with 'Developer ID Application:'"
  security find-identity -v -p codesigning | grep -F "\"$IDENTITY\"" >/dev/null || \
    die "Developer ID Application identity was not found: $IDENTITY"
}

fresh_release_dir() {
  mkdir -p "$RELEASE_ROOT"
  local stamp version
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' '.build/Build/Products/Release/Pica.app/Contents/Info.plist' 2>/dev/null || echo unknown)"
  RELEASE_DIR="$(mktemp -d "$RELEASE_ROOT/Pica-${version}-${stamp}-XXXXXX")"
}

app_path() { printf '%s/stage/%s' "$RELEASE_DIR" "$APP_NAME"; }
dmg_path() { printf '%s/%s' "$RELEASE_DIR" "$DMG_FILE"; }

check_universal_app() {
  local app="$1" executable architectures
  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
  architectures="$(lipo -archs "$app/Contents/MacOS/$executable")"
  printf '%s\n' "$architectures" | grep -qw x86_64 || die "missing x86_64 slice in $executable: $architectures"
  printf '%s\n' "$architectures" | grep -qw arm64 || die "missing arm64 slice in $executable: $architectures"
}

build_and_stage() {
  echo "==> Rebuilding Pica.app"
  ./build-app.sh
  local built_app=".build/Build/Products/Release/$APP_NAME"
  [ -d "$built_app" ] || die "build did not produce $built_app"
  check_universal_app "$built_app"
  fresh_release_dir
  mkdir -p "$RELEASE_DIR/stage"
  ditto "$built_app" "$(app_path)"
  ln -s /Applications "$RELEASE_DIR/stage/Applications"
  local version build git_sha git_dirty xcode_version
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$built_app/Contents/Info.plist")"
  build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$built_app/Contents/Info.plist")"
  git_sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  if [ -n "$(git status --porcelain --untracked-files=normal 2>/dev/null || true)" ]; then git_dirty=true; else git_dirty=false; fi
  xcode_version="$(xcodebuild -version | tr '\n' ';' | sed 's/;$//')"
  printf '%s\n' \
    "mode=$MODE" \
    "created_at=$(date -u +%FT%TZ)" \
    "native_marketing_version=$version" \
    "native_build=$build" \
    "git_sha=$git_sha" \
    "git_dirty=$git_dirty" \
    "xcode_version=$xcode_version" > "$RELEASE_DIR/provenance.txt"
  echo "==> Staged $(app_path)"
}

create_dmg() {
  local label="$1"
  hdiutil create -volname "$label" -srcfolder "$RELEASE_DIR/stage" -ov -format UDZO "$(dmg_path)" >/dev/null
  hdiutil verify "$(dmg_path)" >/dev/null
}

write_checksums() {
  (cd "$RELEASE_DIR" && shasum -a 256 "$(basename "$(dmg_path)")") > "$RELEASE_DIR/SHA256SUMS.txt"
}

verify_checksum() {
  [ -f "$RELEASE_DIR/SHA256SUMS.txt" ] || die "missing SHA256SUMS.txt in $RELEASE_DIR"
  (cd "$RELEASE_DIR" && shasum -a 256 -c SHA256SUMS.txt) >/dev/null || \
    die "DMG checksum does not match the saved release receipt"
}

require_uuid() {
  printf '%s' "$1" | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => process.exit(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? 0 : 1));'
}

assert_no_unexpected_nested_code() {
  local app="$1" main_executable candidate
  main_executable="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
  while IFS= read -r candidate; do
    [ "$candidate" = "$main_executable" ] && continue
    if file "$candidate" | grep -q 'Mach-O'; then
      die "unexpected nested executable requires an explicit signing rule: $candidate"
    fi
  done < <(find "$app/Contents" -type f)
}

sign_release() {
  local app
  app="$(app_path)"
  assert_no_unexpected_nested_code "$app"
  echo "==> Signing app with $IDENTITY"
  codesign --force --options runtime --timestamp --entitlements App/Pica.entitlements --sign "$IDENTITY" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
  create_dmg "Pica"
  echo "==> Signing DMG"
  codesign --force --timestamp --sign "$IDENTITY" "$(dmg_path)"
  codesign --verify --strict --verbose=2 "$(dmg_path)"
  write_checksums
}

submit() {
  local response submission_id
  echo "==> Submitting DMG for notarization"
  response="$(xcrun notarytool submit "$(dmg_path)" --keychain-profile "$NOTARY_PROFILE" --output-format json)"
  printf '%s\n' "$response" > "$RELEASE_DIR/notary-submit.json"
  submission_id="$(printf '%s' "$response" | json_field id 2>/dev/null || true)"
  [ -n "$submission_id" ] || die "notarytool returned no submission id; see $RELEASE_DIR/notary-submit.json"
  require_uuid "$submission_id" || die "notarytool returned an invalid submission id; see $RELEASE_DIR/notary-submit.json"
  printf '%s\n' "$submission_id" > "$RELEASE_DIR/notary-submission-id.txt"
  echo "==> Submitted: $submission_id"
}

finish() {
  local submission_id status info attempt
  [ -d "$RELEASE_DIR" ] || die "release directory does not exist: $RELEASE_DIR"
  RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"
  [ -f "$RELEASE_DIR/notary-submission-id.txt" ] || die "missing notary-submission-id.txt in $RELEASE_DIR"
  [ -f "$(dmg_path)" ] || die "missing Pica.dmg in $RELEASE_DIR"
  verify_checksum
  submission_id="$(tr -d '\n' < "$RELEASE_DIR/notary-submission-id.txt")"
  [ -n "$submission_id" ] || die "empty notarization submission id"
  require_uuid "$submission_id" || die "invalid notarization submission id"
  for attempt in $(seq 1 "$POLL_LIMIT"); do
    info="$(xcrun notarytool info "$submission_id" --keychain-profile "$NOTARY_PROFILE" --output-format json)"
    printf '%s\n' "$info" > "$RELEASE_DIR/notary-info.json"
    status="$(printf '%s' "$info" | json_field status 2>/dev/null || true)"
    case "$status" in
      Accepted)
        xcrun notarytool log "$submission_id" --keychain-profile "$NOTARY_PROFILE" --output-format json > "$RELEASE_DIR/notary-log.json"
        break
        ;;
      Invalid|Rejected)
        xcrun notarytool log "$submission_id" --keychain-profile "$NOTARY_PROFILE" --output-format json > "$RELEASE_DIR/notary-log.json"
        die "notarization $status; see $RELEASE_DIR/notary-info.json and $RELEASE_DIR/notary-log.json"
        ;;
      *) echo "==> Notarization status: ${status:-unknown} ($attempt/$POLL_LIMIT)"; sleep "$POLL_SECONDS" ;;
    esac
  done
  [ "${status:-}" = "Accepted" ] || die "notarization is still pending; rerun --finish $RELEASE_DIR --notary-profile $NOTARY_PROFILE"
  echo "==> Stapling notarization ticket"
  xcrun stapler staple "$(dmg_path)"
  # Stapling changes the DMG. Save that change before later verification so a
  # transient Gatekeeper failure can be retried without rejecting our own file.
  write_checksums
  xcrun stapler validate "$(dmg_path)"
  codesign --verify --strict --verbose=2 "$(dmg_path)"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$(dmg_path)"
  spctl --assess --type execute --verbose=4 "$(app_path)"
  printf '%s\n' "accepted_at=$(date -u +%FT%TZ)" "submission_id=$submission_id" >> "$RELEASE_DIR/provenance.txt"
  write_checksums
  echo "==> Release verified: $(dmg_path)"
}

case "$MODE" in
  prepare)
    build_and_stage
    DMG_FILE="Pica-UNNOTARIZED-PREVIEW.dmg"
    create_dmg "Pica UNNOTARIZED PREVIEW"
    write_checksums
    printf '%s\n' "preview_only=true" >> "$RELEASE_DIR/provenance.txt"
    echo "==> Preview only (unnotarized): $(dmg_path)"
    ;;
  release|submit)
    require_identity
    require_notary_profile
    build_and_stage
    sign_release
    submit
    if [ "$MODE" = "release" ]; then finish; fi
    echo "==> Release directory: $RELEASE_DIR"
    ;;
  finish)
    require_notary_profile
    finish
    ;;
esac
