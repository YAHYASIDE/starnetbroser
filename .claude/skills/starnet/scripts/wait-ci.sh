#!/usr/bin/env bash
# Waits until every GitHub Actions run for a commit has finished, then prints "<name> <status>
# <conclusion>" per run. Usage: wait-ci.sh <sha>   (run it in the background).
set -uo pipefail
sha="${1:?usage: wait-ci.sh <sha>}"
repo="YAHYASIDE/starnetbroser"
sleep 15
for _ in $(seq 1 90); do
  out="$(gh api "repos/$repo/actions/runs?head_sha=$sha" --jq '.workflow_runs[] | "\(.name) \(.status) \(.conclusion)"' 2>/dev/null)"
  if [ -n "$out" ] && ! echo "$out" | grep -qE "queued|in_progress|waiting|pending|requested"; then
    echo "$out"
    exit 0
  fi
  sleep 30
done
echo "still running after 45 min: $out"
exit 1
