#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLI=(npx --yes epub-rsl@0.1.0)
if [[ -x "$ROOT/dist/cli.js" ]]; then
  CLI=(node "$ROOT/dist/cli.js")
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/epub-rsl-demo.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$ROOT/examples/sample-book.epub" "$WORKDIR/sample-book.epub"
cp "$ROOT/examples/rsl-policy.yaml" "$WORKDIR/rsl-policy.yaml"
cd "$WORKDIR"

echo "==> 1. Inspect before embedding"
"${CLI[@]}" inspect sample-book.epub
echo

echo "==> 2. Apply RSL policy"
"${CLI[@]}" apply sample-book.epub --policy rsl-policy.yaml --output sample-book.rsl.epub
echo

echo "==> 3. Inspect after embedding"
"${CLI[@]}" inspect sample-book.rsl.epub
echo

echo "==> 4. Validate"
"${CLI[@]}" validate sample-book.rsl.epub
echo

echo "Demo complete. Source EPUB was never modified."
