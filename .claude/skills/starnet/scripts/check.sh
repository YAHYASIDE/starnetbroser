#!/usr/bin/env bash
# STAR NET pre-push check: typecheck every workspace, then both vitest suites. Prints only the
# summary lines and errors; exits non-zero on any failure.
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
fail=0

echo "== typecheck"
if ! out="$(cd "$root" && npm run typecheck 2>&1)"; then
  echo "$out" | grep -E "error|Error" | head -40
  fail=1
else
  echo "ok"
fi

for pkg in apps/web packages/local-browser-plugin; do
  echo "== vitest $pkg"
  out="$(cd "$root/$pkg" && npx vitest run 2>&1)"
  code=$?
  echo "$out" | grep -E "Tests |Test Files |×|FAIL" | head -40
  [ $code -ne 0 ] && fail=1
done

exit $fail
