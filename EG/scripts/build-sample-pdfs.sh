#!/usr/bin/env bash
# Regenerates the sample PDFs in assets/samples/ with headless Chrome (4 renders in parallel).
#   scripts/build-sample-pdfs.sh        → English edition (assets/samples/en/**)
#   scripts/build-sample-pdfs.sh ar     → Arabic edition  (assets/samples/** and assets/samples/hr/**)
#   scripts/build-sample-pdfs.sh all    → both
#   scripts/build-sample-pdfs.sh en hr  → only the HR templates of the English edition (also: fin)
# Needs Google Chrome; fonts load from Google Fonts at render time (online).
set -euo pipefail
cd "$(dirname "$0")/.."
export ROOT="$PWD"
export CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
FIN=(invoice delivery statement report workorder payslip quotation voucher payroll aging proforma)
HR=(offer contract confirm warning deduction leave overtime loan salcert expcert resign clearance settlement incident attendance ack custody)
MODE="${1:-en}"; PART="${2:-both}"
jobs=()
add() { jobs+=("$1|$2"); }

if [[ "$MODE" == "en" || "$MODE" == "all" ]]; then
  mkdir -p assets/samples/en/hr
  if [[ "$PART" != "hr" ]]; then
    for d in "${FIN[@]}"; do add "assets/samples/en/$d.pdf" "documents-en.html?doc=$d"; done
    add "assets/samples/en/all-templates.pdf" "documents-en.html"
  fi
  if [[ "$PART" != "fin" ]]; then
    for d in "${HR[@]}"; do add "assets/samples/en/hr/$d.pdf" "hr-documents-en.html?doc=$d"; done
  fi
fi
if [[ "$MODE" == "ar" || "$MODE" == "all" ]]; then
  mkdir -p assets/samples/hr
  if [[ "$PART" != "hr" ]]; then
    for d in "${FIN[@]}"; do add "assets/samples/$d.pdf" "documents.html?doc=$d"; done
    add "assets/samples/all-templates.pdf" "documents.html"
  fi
  if [[ "$PART" != "fin" ]]; then
    for d in "${HR[@]}"; do add "assets/samples/hr/$d.pdf" "hr-documents.html?doc=$d"; done
  fi
fi

render() {
  out="${1%%|*}"; page="${1#*|}"
  prof="$(mktemp -d)"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=10000 \
    --user-data-dir="$prof" --print-to-pdf="$ROOT/$out" "file://$ROOT/$page" >/dev/null 2>&1 || echo "  FAILED $out"
  rm -rf "$prof"; echo "  $out"
}
export -f render
printf '%s\n' "${jobs[@]}" | xargs -P "${JOBS:-4}" -I{} bash -c 'render "$1"' _ {}
echo "done (${#jobs[@]} files)"
