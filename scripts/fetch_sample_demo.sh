#!/usr/bin/env bash
# Downloads a real CS2 demo (de_mirage, Valve matchmaking, 10 rounds) from the demoparser2 test suite
# (MIT licensed, https://github.com/LaihoE/demoparser) to use as an upload example.
set -euo pipefail
DEST="${1:-$(dirname "$0")/../samples/test_demo_mirage.dem}"
mkdir -p "$(dirname "$DEST")"
curl -fL --retry 3 -o "$DEST" https://raw.githubusercontent.com/LaihoE/demoparser/main/src/parser/test_demo.dem
echo "saved to $DEST ($(du -h "$DEST" | cut -f1))"
