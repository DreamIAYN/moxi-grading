#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./bin/cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate
