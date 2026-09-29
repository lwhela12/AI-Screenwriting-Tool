# Releasing Pica for macOS

`build-app.sh` remains the development build: it creates an ad-hoc signed app.
Use `release-app.sh` for a Developer ID release. Preparing or submitting a new
release rebuilds from the current checkout and creates a new directory under
the gitignored `mac/.build/releases/`. The `--finish` command resumes an
existing submission without rebuilding or uploading again. The workflow never
installs into `/Applications` or overwrites a previous release.

## One-time Apple setup

Install a current **Developer ID Application** certificate with its private key
in the login keychain. Confirm the exact identity before releasing:

```bash
security find-identity -v -p codesigning
```

Create a named notary credential profile interactively. This stores the
credential in the Keychain; do not put Apple credentials in a shell history,
repository file, or CI log:

```bash
xcrun notarytool store-credentials pica-notary
```

The prompts request the Apple ID, Team ID, and app-specific password. See
`xcrun notarytool store-credentials --help` for Apple-supported alternatives
such as App Store Connect API keys.

## Commands

Create a local-review artifact only:

```bash
npm run app:release:prepare
```

This DMG is intentionally labeled **UNNOTARIZED PREVIEW** and must not be used
for public distribution.

Build, sign, notarize, staple, and verify a release:

```bash
npm run app:release -- --release --identity "Developer ID Application: Your Name (TEAMID)" --notary-profile pica-notary
```

The workflow checks both `x86_64` and `arm64` in the app executable, applies
the hardened runtime and secure timestamps, verifies code signatures, creates a
DMG containing `Pica.app` and an `Applications` shortcut, then submits it to
Apple. It marks the release verified only after Apple reports `Accepted`, the
ticket staples and validates, and Gatekeeper assesses both the DMG and staged
app.

For a long pending job, submit once and finish later without a second upload:

```bash
npm run app:release -- --submit --identity "Developer ID Application: Your Name (TEAMID)" --notary-profile pica-notary
npm run app:release -- --finish mac/.build/releases/Pica-... --notary-profile pica-notary
```

`notary-submission-id.txt`, Apple JSON responses and log, `provenance.txt`, and
`SHA256SUMS.txt` stay beside the DMG. If notarization is rejected, inspect the
saved response and log. The normal release wait is bounded to five minutes;
finish a still-pending submission later from the repository root with the
same root-relative path. The script verifies the saved SHA-256 receipt before
it queries or staples a resumed submission.

To retrieve a log manually:

```bash
xcrun notarytool log "$(cat mac/.build/releases/Pica-.../notary-submission-id.txt)" --keychain-profile pica-notary
```

## First-install verification

On a clean or separate macOS account, download the final DMG, open it, drag
Pica to Applications, and launch it normally. Confirm Gatekeeper presents no
unidentified-developer warning, the welcome screen appears, and a new script
can be created and reopened. Keep this manual check separate from the local
signature and Gatekeeper assessment performed by the script.
