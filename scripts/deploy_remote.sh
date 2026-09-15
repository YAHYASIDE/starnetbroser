#!/bin/bash
# Runs ON the VPS (piped over SSH by .github/workflows/deploy-vps.yml, never
# executed locally). Pulls the given branch, rebuilds, and rolls back to the
# previously-deployed commit if the build or the post-deploy health check
# fails - a bad push should never leave the staging server down.
#
# Usage: deploy_remote.sh <deploy_path> <branch>
set -euo pipefail

DEPLOY_PATH="$1"
BRANCH="$2"

cd "$DEPLOY_PATH"

PREVIOUS_SHA=$(git rev-parse HEAD)
echo "Current deployed commit: $PREVIOUS_SHA"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
NEW_SHA=$(git rev-parse HEAD)
echo "Deploying commit: $NEW_SHA"

roll_back() {
    echo "Rolling back to $PREVIOUS_SHA"
    git reset --hard "$PREVIOUS_SHA"
    docker compose build
    docker compose up -d --remove-orphans
}

if ! docker compose build || ! docker compose up -d --remove-orphans; then
    echo "Deploy failed to start"
    roll_back
    exit 1
fi

for _ in $(seq 1 20); do
    if curl -sf http://127.0.0.1:8000/health > /dev/null; then
        echo "Health check passed - deploy succeeded: $NEW_SHA"
        echo "$NEW_SHA" > .last-good-deploy
        exit 0
    fi
    sleep 3
done

echo "Health check never passed after deploy"
roll_back
exit 1
