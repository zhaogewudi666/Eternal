#!/bin/bash
# Eternal release builder: builds macOS dmg + Windows exe (signed updater
# artifacts), generates update.json (Gitee-first URL), publishes the GitHub
# Release, then mirrors code + assets to both GitHub and Gitee so domestic
# Windows clients can auto-update from Gitee raw.
#
# Usage: build-release.sh <version> <notes-file>
#   version      e.g. 0.2.9
#   notes-file   markdown release notes (GitHub release body + update notes)
set -euo pipefail

VERSION="${1:?version required}"
NOTES_FILE="${2:?notes file required}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_DIR="$(dirname "$APP_DIR")/releases"
REPO="zhaogewudi666/Eternal"
GITEE_REPO="zhaowudi/eternal"
KEY="$HOME/.tauri/eternal-updater.key"

export RUSTUP_HOME="$HOME/.local/share/mise/rustup"
export CARGO_HOME="$HOME/.local/share/mise/cargo"
export PATH="$HOME/.local/share/mise/cargo/bin:$PATH"
export XWIN_CACHE_DIR="$APP_DIR/src-tauri/target/xwin-cache"
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

echo "== Building macOS dmg =="
(cd "$APP_DIR" && npm run tauri build 2>&1 | tail -3)

echo "== Building Windows x64 exe (signed) =="
(cd "$APP_DIR" && npm run tauri build -- --target x86_64-pc-windows-msvc --runner cargo-xwin 2>&1 | tail -4)

DMG="$APP_DIR/src-tauri/target/release/bundle/dmg/Eternal_${VERSION}_aarch64.dmg"
EXE="$APP_DIR/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Eternal_${VERSION}_x64-setup.exe"
SIG="$EXE.sig"
[ -f "$DMG" ] || { echo "missing dmg: $DMG"; exit 1; }
[ -f "$EXE" ] && [ -f "$SIG" ] || { echo "missing exe or sig"; exit 1; }

echo "== Archiving artifacts =="
mkdir -p "$RELEASES_DIR/${VERSION}"
cp "$DMG" "$RELEASES_DIR/${VERSION}/Eternal-${VERSION}-macOS-arm64.dmg"
cp "$EXE" "$RELEASES_DIR/${VERSION}/Eternal-${VERSION}-Windows-x64-Setup.exe"
cp "$SIG" "$RELEASES_DIR/${VERSION}/"
(cd "$RELEASES_DIR/${VERSION}" && shasum -a 256 Eternal-${VERSION}-macOS-arm64.dmg Eternal-${VERSION}-Windows-x64-Setup.exe > SHA256SUMS)

echo "== Building update.json (Gitee-first) =="
SIGNATURE="$(cat "$SIG")"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WIN_URL="https://gitee.com/${GITEE_REPO}/raw/main/releases/${VERSION}/Eternal_${VERSION}_x64-setup.exe"
NOTES="$(head -5 "$NOTES_FILE" | tr '\n' ' ')"
mkdir -p "$RELEASES_DIR/${VERSION}"
cat > "$RELEASES_DIR/${VERSION}/update.json" <<EOF
{
  "version": "${VERSION}",
  "notes": "${NOTES}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "windows-x86_64": {
      "signature": "${SIGNATURE}",
      "url": "${WIN_URL}"
    }
  }
}
EOF
echo "update.json written to releases/${VERSION}/update.json"

echo "== Creating GitHub release v${VERSION} =="
gh release create "v${VERSION}" --repo "$REPO" --title "Eternal ${VERSION}" \
  --target main --notes-file "$NOTES_FILE" \
  "$DMG#Eternal-${VERSION}-macOS-arm64.dmg" \
  "$EXE#Eternal-${VERSION}-Windows-x64-Setup.exe" \
  "$SIG#Eternal-${VERSION}-Windows-x64-Setup.exe.sig" \
  "$RELEASES_DIR/${VERSION}/update.json" 2>&1 | tail -3

echo "== Mirroring to GitHub + Gitee (code + assets + root update.json) =="
cp "$RELEASES_DIR/${VERSION}/update.json" "$RELEASES_DIR/../update.json"
cd "$(dirname "$RELEASES_DIR")"
git add "releases/${VERSION}/" update.json
git commit -m "chore: archive v${VERSION} release assets and update manifest" 2>&1 | tail -1
git push origin HEAD:main 2>&1 | tail -1
GIT_TERMINAL_PROMPT=0 git push gitee HEAD:main 2>&1 | tail -1

echo "== Done. GitHub + Gitee both at $(git rev-parse --short HEAD) =="
