#!/usr/bin/env bash
# Optional: download CS2 radar images (from awpy-data releases, extracted from game files) for the tactical map.
# Not committed to the repo: they are Valve game assets. Without them the map is drawn as a schematic.
set -euo pipefail
DEST="${1:-$(dirname "$0")/../backend/data/radars}"
TAG="${AWPY_DATA_TAG:-2000935}"
TMP="$(mktemp -d)"
curl -fL --retry 3 -o "$TMP/images.zip" "https://github.com/pnxenopoulos/awpy-data/releases/download/$TAG/images.zip"
mkdir -p "$DEST"
unzip -o -j -q "$TMP/images.zip" 'radars/de_*.png' -d "$DEST"
rm -rf "$TMP"
ls "$DEST"
