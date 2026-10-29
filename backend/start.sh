#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8000}"
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port "${PORT}" --proxy-headers
