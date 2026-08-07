#!/bin/bash
# Credentials live in .env.claude, which is gitignored and never committed.
# Copy .env.claude.example to .env.claude and fill in your own token.
set -euo pipefail

env_file="$(dirname "${BASH_SOURCE[0]}")/.env.claude"

if [ ! -f "$env_file" ]; then
  echo "run_claude.sh: missing $env_file" >&2
  echo "Copy .env.claude.example to .env.claude and set your token." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

claude "$@"
