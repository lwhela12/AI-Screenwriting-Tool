#!/bin/bash
# Fast safety checks for argument parsing and resumable release gates. These
# use command fixtures; they never build, sign, submit, or call Apple.
set -euo pipefail
cd "$(dirname "$0")"

help="$(./release-app.sh --help)"
printf '%s\n' "$help" | grep -Fq -- '--prepare'
printf '%s\n' "$help" | grep -Fq -- '--finish RELEASE_DIRECTORY'

if ./release-app.sh --prepare --release >/dev/null 2>&1; then
  echo "expected conflicting modes to fail before a build" >&2
  exit 1
fi

if ./release-app.sh --finish >/dev/null 2>&1; then
  echo "expected --finish without a directory to fail" >&2
  exit 1
fi

fixture_bin="$(mktemp -d)"
mkdir -p .build
fixture_release="$(mktemp -d "$PWD/.build/release-app-test.XXXXXX")"
fixture_log="$(mktemp)"
cleanup() { rm -rf "$fixture_bin" "$fixture_release"; rm -f "$fixture_log"; }
trap cleanup EXIT

make_fixture() {
  local name="$1"
  shift
  { printf '%s\n' '#!/bin/bash'; printf '%s\n' "$@"; } > "$fixture_bin/$name"
  chmod +x "$fixture_bin/$name"
}

make_fixture xcodebuild 'exit 0'
make_fixture codesign 'exit 0'
make_fixture hdiutil 'exit 0'
make_fixture lipo 'exit 0'
make_fixture spctl 'exit 0'
make_fixture xcrun \
  'printf "%s\n" "$*" >> "$PICA_RELEASE_TEST_LOG"' \
  'case "$1:$2" in' \
  '  notarytool:history) echo '\''{"history":[]}'\'' ;;' \
  '  notarytool:info) printf '\''{"status":"%s"}\n'\'' "${PICA_RELEASE_TEST_STATUS:-Accepted}" ;;' \
  '  notarytool:log) echo '\''{"issues":[]}'\'' ;;' \
  'esac'

mkdir -p "$fixture_release/stage/Pica.app"
printf 'fixture-dmg' > "$fixture_release/Pica.dmg"
(cd "$fixture_release" && shasum -a 256 Pica.dmg > SHA256SUMS.txt)
printf '%s\n' '11111111-1111-4111-8111-111111111111' > "$fixture_release/notary-submission-id.txt"

relative_release="mac/.build/$(basename "$fixture_release")"
(cd .. && PATH="$fixture_bin:$PATH" PICA_RELEASE_TEST_LOG="$fixture_log" bash mac/release-app.sh --finish "$relative_release" --notary-profile fixture)
test -f "$fixture_release/notary-log.json"
grep -Fq 'notarytool info' "$fixture_log"
grep -Fq 'stapler staple' "$fixture_log"

# Rejected and pending submissions must never staple or claim a verified release.
for status in Invalid 'In Progress'; do
  : > "$fixture_log"
  if (cd .. && PATH="$fixture_bin:$PATH" PICA_RELEASE_TEST_LOG="$fixture_log" PICA_RELEASE_TEST_STATUS="$status" PICA_NOTARY_POLL_LIMIT=1 PICA_NOTARY_POLL_SECONDS=0 bash mac/release-app.sh --finish "$relative_release" --notary-profile fixture >/dev/null 2>&1); then
    echo "expected $status submission to stop without a release" >&2
    exit 1
  fi
  if grep -Fq 'stapler staple' "$fixture_log"; then
    echo "unaccepted submission was stapled" >&2
    exit 1
  fi
done

# A changed DMG must stop before any submission status lookup or stapling.
printf 'changed' >> "$fixture_release/Pica.dmg"
: > "$fixture_log"
if (cd .. && PATH="$fixture_bin:$PATH" PICA_RELEASE_TEST_LOG="$fixture_log" bash mac/release-app.sh --finish "$relative_release" --notary-profile fixture >/dev/null 2>&1); then
  echo "expected changed DMG receipt verification to fail" >&2
  exit 1
fi
if grep -Fq 'notarytool info' "$fixture_log"; then
  echo "changed DMG was queried for notarization before receipt verification" >&2
  exit 1
fi
