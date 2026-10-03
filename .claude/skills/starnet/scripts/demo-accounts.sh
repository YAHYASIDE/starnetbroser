#!/usr/bin/env bash
# Prints the app's fictional demo devices as JSON (for seeding Playwright checks).
# Usage: bash demo-accounts.sh > "$SCRATCH/accts.json"
cd "$(git rev-parse --show-toplevel)/apps/web" && npx tsx -e "import { demoAccounts } from './src/lib/demoData'; console.log(JSON.stringify(demoAccounts))"
