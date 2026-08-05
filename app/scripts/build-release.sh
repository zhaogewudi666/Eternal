#!/bin/bash
# Eternal release builder: builds macOS dmg + Windows exe (signed updater
# artifacts), generates update.json, uploads to GitHub Releases.
# Gitee mirror upload is a follow-up once the Gitee repo exists.
#
# Usage: build-release.sh <version> <notes-file> [gitee-repo]
#   version     e.g. 0.2.7
#   notes-file  markdown release notes used for both GitHub release body
#               and the update.json "notes" field
#   gitee-repo  optional "owner/repo" on Gitee to also mirror (default: none)
set -euo pipefail

VERSION="${1:?version required}"
NOTES_FILE="${2:?notes file required}"
GITEE_REPO="${3:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASES_DIR="$(dirname "$APP_DIR")/releases"
REPO="zhaogewudi666/Eternal"
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

echo "== Building update.json =="
SIGNATURE="$(cat "$SIG")"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ -n "$GITEE_REPO" ]; then
  WIN_URL="https://gitee.com/${GITEE_REPO}/releases/download/v${VERSION}/Eternal_${VERSION}_x64-setup.exe"
else
  WIN_URL="https://github.com/${REPO}/releases/download/v${VERSION}/Eternal_${VERSION}_x64-setup.exe"
fi
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

echo "== Done. Next: mirror release artifacts + update.json to Gitee. =="
