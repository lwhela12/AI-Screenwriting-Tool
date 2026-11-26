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

Install the GitHub CLI and sign in once, so a release can be published:

```bash
gh auth login
```

### Sparkle update key

Installed copies of Pica update themselves with
[Sparkle](https://sparkle-project.org). Each update is signed with an EdDSA key
that lives in your login keychain; the app carries the matching public key and
refuses any update it cannot verify. Create the key once, after the first
build has downloaded Sparkle:

```bash
./build-app.sh
./.build/SourcePackages/artifacts/sparkle/Sparkle/bin/generate_keys
```

It prints a public key. Paste it into `project.yml` as `SPARKLE_PUBLIC_ED_KEY`
and commit that change; release-app.sh refuses to release until it is set.
Back up the private key somewhere safe, outside the repository:

```bash
./.build/SourcePackages/artifacts/sparkle/Sparkle/bin/generate_keys -x ~/pica-sparkle-private-key
```

If the private key is lost, copies already installed can no longer update and
testers must download Pica again by hand.

## Shipping an update

From a clean, pushed `main`, one command builds, signs, notarizes, verifies and
publishes:

```bash
npm run app:release -- --release --version 0.2.0 \
  --identity "Developer ID Application: Your Name (TEAMID)" --notary-profile pica-notary \
  --and-publish --notes path/to/notes.md
```

`--version` is the version testers see and must be new each time; the build
number is the commit count, so every release from `main` is newer than the one
before. Publishing creates the GitHub release `v0.2.0` with `Pica.dmg` and
`appcast.xml` attached. Installed copies look for that appcast on the latest
release, find the newer build, and offer it (Pica > Check for Updates… checks
at once). `--notes` is optional; without it the notes say only the version.

Share this link with testers; it always downloads the newest release:

```
https://github.com/lwhela12/AI-Screenwriting-Tool/releases/latest/download/Pica.dmg
```

A verified release that was not published yet can be published later:

```bash
npm run app:release -- --publish mac/.build/releases/Pica-... --notes path/to/notes.md
```

Publishing refuses previews, unverified releases, builds made from uncommitted
changes, commits not yet on GitHub, and a version that already has a release.

## Commands

Create a local-review artifact only:

```bash
npm run app:release:prepare
```

This DMG is intentionally labeled **UNNOTARIZED PREVIEW** and must not be used
for public distribution.

Build, sign, notarize, staple, and verify a release:

```bash
npm run app:release -- --release --version 0.2.0 --identity "Developer ID Application: Your Name (TEAMID)" --notary-profile pica-notary
```

The workflow checks both `x86_64` and `arm64` in the app executable, signs
Sparkle's helpers inside out, applies the hardened runtime and secure timestamps, verifies code signatures, creates a
DMG containing `Pica.app` and an `Applications` shortcut, then submits it to
Apple. It marks the release verified only after Apple reports `Accepted`, the
ticket staples and validates, and Gatekeeper assesses both the DMG and staged
app.

For a long pending job, submit once and finish later without a second upload:

```bash
npm run app:release -- --submit --version 0.2.0 --identity "Developer ID Application: Your Name (TEAMID)" --notary-profile pica-notary
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
