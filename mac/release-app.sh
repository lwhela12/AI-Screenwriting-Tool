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
  ./release-app.sh --release --version X.Y.Z --identity "Developer ID Application: ..." --notary-profile PROFILE [--and-publish] [--notes FILE]
  ./release-app.sh --submit --version X.Y.Z --identity "Developer ID Application: ..." --notary-profile PROFILE
  ./release-app.sh --finish RELEASE_DIRECTORY --notary-profile PROFILE [--and-publish] [--notes FILE]
  ./release-app.sh --publish RELEASE_DIRECTORY [--notes FILE]

--prepare creates an explicitly UNNOTARIZED preview DMG. It is for local
review only and must not be distributed as a signed release.

--release builds, signs, submits, waits for acceptance, staples, and verifies.
--submit does the same through submission, then exits and records the submission
ID. Use --finish to resume that release directory without uploading again.

--version sets the version testers see; the build number is the commit count,
so each release is newer than the last. A release needs Sparkle's public key in
project.yml (SPARKLE_PUBLIC_ED_KEY), or installed copies could not update.

--publish takes a verified release directory, signs the DMG for Sparkle with
the private key in your login keychain, writes appcast.xml, and creates the
GitHub release vX.Y.Z with Pica.dmg and appcast.xml attached, using the GitHub
CLI (gh). --and-publish does this straight after --release or --finish.
--notes FILE uses that file as the release notes.

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
VERSION=""
NOTES_FILE=""
AND_PUBLISH=false

resolve_dir() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$INVOCATION_DIR" "$1" ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prepare|--release|--submit) [ -z "$MODE" ] || die "choose one mode"; MODE="${1#--}" ;;
    --finish)
      [ -z "$MODE" ] || die "choose one mode"
      MODE="finish"
      shift
      [ "$#" -gt 0 ] || die "--finish requires RELEASE_DIRECTORY"
      RELEASE_DIR="$(resolve_dir "$1")"
      ;;
    --publish)
      [ -z "$MODE" ] || die "choose one mode"
      MODE="publish"
      shift
      [ "$#" -gt 0 ] || die "--publish requires RELEASE_DIRECTORY"
      RELEASE_DIR="$(resolve_dir "$1")"
      ;;
    --version) shift; [ "$#" -gt 0 ] || die "--version requires a value"; VERSION="$1" ;;
    --notes) shift; [ "$#" -gt 0 ] || die "--notes requires a file"; NOTES_FILE="$(resolve_dir "$1")" ;;
    --and-publish) AND_PUBLISH=true ;;
    --identity) shift; [ "$#" -gt 0 ] || die "--identity requires a value"; IDENTITY="$1" ;;
    --notary-profile) shift; [ "$#" -gt 0 ] || die "--notary-profile requires a value"; NOTARY_PROFILE="$1" ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
[ -n "$MODE" ] || { usage >&2; exit 2; }

if [ -n "$VERSION" ]; then
  printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "--version must look like 1.2.3"
fi
case "$MODE" in
  release|submit) [ -n "$VERSION" ] || die "--version is required for --$MODE" ;;
esac
if [ "$AND_PUBLISH" = true ]; then
  case "$MODE" in release|finish) ;; *) die "--and-publish works with --release or --finish" ;; esac
fi
if [ -n "$NOTES_FILE" ]; then
  [ -f "$NOTES_FILE" ] || die "notes file not found: $NOTES_FILE"
fi

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

require_sparkle_key() {
  local key
  key="$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$1/Contents/Info.plist" 2>/dev/null || true)"
  [ -n "$key" ] || die "SPARKLE_PUBLIC_ED_KEY is empty in project.yml; run Sparkle's generate_keys and paste the public key (see RELEASING.md)"
}

# Sparkle ships helpers inside its framework. Sign them inside-out with the
# same identity and hardened runtime, as Sparkle's documentation describes.
sparkle_framework() { printf '%s/Contents/Frameworks/Sparkle.framework' "$1"; }

sign_sparkle() {
  local framework current
  framework="$(sparkle_framework "$1")"
  [ -d "$framework" ] || return 0
  current="$framework/Versions/Current"
  [ -d "$current/XPCServices/Installer.xpc" ] && \
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$current/XPCServices/Installer.xpc"
  [ -d "$current/XPCServices/Downloader.xpc" ] && \
    codesign --force --options runtime --timestamp --preserve-metadata=entitlements --sign "$IDENTITY" "$current/XPCServices/Downloader.xpc"
  [ -e "$current/Autoupdate" ] && \
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$current/Autoupdate"
  [ -d "$current/Updater.app" ] && \
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$current/Updater.app"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$framework"
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
  local build_number
  build_number="$(git rev-list --count HEAD 2>/dev/null || true)"
  [ -n "$build_number" ] || die "could not count commits for the build number"
  local distribution=0
  [ "$MODE" = "prepare" ] || distribution=1
  PICA_MARKETING_VERSION="$VERSION" PICA_BUILD_NUMBER="$build_number" PICA_DISTRIBUTION="$distribution" ./build-app.sh
  local built_app=".build/Build/Products/Release/$APP_NAME"
  [ -d "$built_app" ] || die "build did not produce $built_app"
  check_universal_app "$built_app"
  if [ "$MODE" != "prepare" ]; then require_sparkle_key "$built_app"; fi
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
    case "$candidate" in "$(sparkle_framework "$app")"/*) continue ;; esac
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
  sign_sparkle "$app"
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

provenance_value() {
  { grep -E "^$1=" "$RELEASE_DIR/provenance.txt" || true; } | tail -n 1 | cut -d= -f2-
}

find_sign_update() {
  find "$SCRIPT_DIR/.build/SourcePackages/artifacts" -type f -path '*/bin/sign_update' 2>/dev/null | head -n 1
}

publish() {
  need gh
  [ -d "$RELEASE_DIR" ] || die "release directory does not exist: $RELEASE_DIR"
  RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"
  [ -f "$RELEASE_DIR/provenance.txt" ] || die "missing provenance.txt in $RELEASE_DIR"
  [ -f "$(dmg_path)" ] || die "missing Pica.dmg in $RELEASE_DIR"
  [ -z "$(provenance_value preview_only)" ] || die "a preview DMG is never published"
  [ -n "$(provenance_value accepted_at)" ] || die "release is not notarized and verified yet; run --finish first"
  [ "$(provenance_value git_dirty)" = "false" ] || die "release was built from uncommitted changes; commit, push and release again"
  verify_checksum

  local app plist version build git_sha feed repo tag min_os sign_update signature notes_file
  app="$(app_path)"
  plist="$app/Contents/Info.plist"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
  build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")"
  min_os="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")"
  feed="$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$plist" 2>/dev/null || true)"
  git_sha="$(provenance_value git_sha)"
  repo="$(printf '%s' "$feed" | sed -nE 's#^https://github\.com/([^/]+/[^/]+)/releases/latest/download/appcast\.xml$#\1#p')"
  [ -n "$repo" ] || die "SUFeedURL is not a GitHub latest-release appcast URL: $feed"
  tag="v$version"

  if gh release view "$tag" -R "$repo" >/dev/null 2>&1; then
    die "$repo already has a release $tag; release again with a new --version"
  fi
  gh api "repos/$repo/commits/$git_sha" >/dev/null 2>&1 || \
    die "commit $git_sha is not on GitHub; push it before publishing"

  sign_update="$(find_sign_update)"
  [ -n "$sign_update" ] || die "Sparkle's sign_update was not found under .build/SourcePackages; build the app once first"
  echo "==> Signing the update with the Sparkle key in your keychain"
  signature="$("$sign_update" "$(dmg_path)")"
  printf '%s\n' "$signature" | grep -Eq '^sparkle:edSignature="[A-Za-z0-9+/=]+" length="[0-9]+"$' || \
    die "unexpected sign_update output: $signature"

  notes_file="$NOTES_FILE"
  if [ -z "$notes_file" ]; then
    notes_file="$RELEASE_DIR/release-notes.md"
    printf 'Pica %s\n' "$version" > "$notes_file"
  fi

  echo "==> Writing appcast.xml"
  node - "$RELEASE_DIR/appcast.xml" "$repo" "$tag" "$version" "$build" "$min_os" "$signature" "$notes_file" <<'NODE'
const fs = require("fs");
const [out, repo, tag, version, build, minOS, signature, notesFile] = process.argv.slice(2);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const notes = fs.readFileSync(notesFile, "utf8").trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Pica</title>
    <item>
      <title>Pica ${esc(version)}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${esc(build)}</sparkle:version>
      <sparkle:shortVersionString>${esc(version)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${esc(minOS)}</sparkle:minimumSystemVersion>
      <sparkle:fullReleaseNotesLink>https://github.com/${repo}/releases/tag/${tag}</sparkle:fullReleaseNotesLink>
      <description><![CDATA[${notes.replace(/]]>/g, "]]&gt;")}]]></description>
      <enclosure url="https://github.com/${repo}/releases/download/${tag}/Pica.dmg" ${signature} type="application/octet-stream"/>
    </item>
  </channel>
</rss>
`;
fs.writeFileSync(out, xml);
NODE

  echo "==> Creating GitHub release $tag on $repo"
  gh release create "$tag" "$(dmg_path)" "$RELEASE_DIR/appcast.xml" \
    -R "$repo" --target "$git_sha" --title "Pica $version" --notes-file "$notes_file"
  gh release view "$tag" -R "$repo" --json assets --jq '.assets[].name' > "$RELEASE_DIR/published-assets.txt"
  grep -qx 'Pica.dmg' "$RELEASE_DIR/published-assets.txt" || die "release $tag is missing Pica.dmg"
  grep -qx 'appcast.xml' "$RELEASE_DIR/published-assets.txt" || die "release $tag is missing appcast.xml"
  printf '%s\n' "published_at=$(date -u +%FT%TZ)" "published_tag=$tag" "published_repo=$repo" >> "$RELEASE_DIR/provenance.txt"
  echo "==> Published $tag"
  echo "==> Download link for testers: https://github.com/$repo/releases/latest/download/Pica.dmg"
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
    if [ "$MODE" = "release" ]; then
      finish
      if [ "$AND_PUBLISH" = true ]; then publish; fi
    fi
    echo "==> Release directory: $RELEASE_DIR"
    ;;
  finish)
    require_notary_profile
    finish
    if [ "$AND_PUBLISH" = true ]; then publish; fi
    ;;
  publish)
    publish
    ;;
esac
