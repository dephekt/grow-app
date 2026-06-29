#!/usr/bin/env bash
# Capture a sanitized snapshot + thermal image from the live daniel-home site for
# use as the Playwright screenshot fixture. Re-run when the real devices change.
#
#   scripts/capture-fixture.sh            # uses docker context "media-server"
#   GROW_CTX=media-server scripts/capture-fixture.sh
#
# Writes:
#   e2e/fixtures/live-snapshot.ts   (typed Snapshot, sanitized)
#   e2e/fixtures/thermal.jpg        (one real thermal frame)
set -euo pipefail
CTX="${GROW_CTX:-media-server}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT

echo "Capturing /api/snapshot from $CTX:grow-app-site …"
docker --context "$CTX" exec grow-app-site sh -c \
  'node -e "fetch(\"http://127.0.0.1:3000/api/snapshot\").then(r=>r.text()).then(t=>process.stdout.write(t))"' > "$RAW"

CAM="$(node -e "const s=JSON.parse(require('fs').readFileSync('$RAW','utf8')); const c=s.entities.find(e=>e.component==='camera'); process.stdout.write(c?c.id:'')")"
if [ -n "$CAM" ]; then
  echo "Capturing thermal frame ($CAM) …"
  docker --context "$CTX" exec grow-app-site sh -c \
    "node -e \"fetch('http://127.0.0.1:3000/api/entities/$CAM/image').then(r=>r.arrayBuffer()).then(b=>process.stdout.write(Buffer.from(b)))\"" > "$ROOT/e2e/fixtures/thermal.jpg"
fi

node "$ROOT/scripts/sanitize-fixture.mjs" "$RAW" "$ROOT/e2e/fixtures/live-snapshot.ts"
echo "Done."
