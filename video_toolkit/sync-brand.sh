#!/usr/bin/env bash
# video_toolkit/sync-brand.sh <brand-name>
#
# Copies files listed in brands/<brand-name>/.sync.json from the source
# repo into the brand profile. Idempotent.

set -euo pipefail

BRAND="${1:-}"
if [[ -z "$BRAND" ]]; then
  echo "Usage: video_toolkit/sync-brand.sh <brand-name>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAND_DIR="$ROOT/brands/$BRAND"
SYNC_FILE="$BRAND_DIR/.sync.json"

if [[ ! -f "$SYNC_FILE" ]]; then
  echo "No .sync.json found at $SYNC_FILE" >&2
  exit 1
fi

SOURCE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['source'])" "$SYNC_FILE")

if [[ ! -d "$SOURCE" ]]; then
  echo "Source directory does not exist: $SOURCE" >&2
  exit 1
fi

echo "Syncing from: $SOURCE"
echo "Into:         $BRAND_DIR"
echo

python3 -c "
import json, sys
m = json.load(open(sys.argv[1]))
for item in m['manifest']:
    print(item['from'] + '\t' + item['to'])
" "$SYNC_FILE" | while IFS=$'\t' read -r FROM TO; do
  SRC="$SOURCE/$FROM"
  DST="$BRAND_DIR/$TO"

  if [[ ! -f "$SRC" ]]; then
    echo "  MISSING: $FROM (source does not exist)" >&2
    continue
  fi

  mkdir -p "$(dirname "$DST")"

  if [[ -f "$DST" ]] && cmp -s "$SRC" "$DST"; then
    echo "  SAME:    $TO"
  else
    cp "$SRC" "$DST"
    echo "  COPIED:  $TO"
  fi
done

echo
echo "Done."
