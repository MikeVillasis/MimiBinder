#!/bin/sh
# Trigger the daily price snapshot by hand. Prompts for CRON_SECRET without echoing it.
# Usage: sh scripts/run-snapshot.sh [base-url]
BASE="${1:-https://mimi-binder.vercel.app}"
printf "CRON_SECRET: "
stty -echo
read -r SECRET
stty echo
printf "\nRunning snapshot on %s ...\n" "$BASE"
curl -s -H "Authorization: Bearer $SECRET" "$BASE/api/cron/snapshot"
printf "\n"
unset SECRET
