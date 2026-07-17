#!/usr/bin/env bash
set -Eeuo pipefail

cd /opt/egp-admin/app
compose=(docker compose -f docker-compose.production.yml)

"${compose[@]}" up -d --build --remove-orphans

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3100/ >/dev/null; then
    "${compose[@]}" ps || true
    exit 0
  fi
  sleep 3
done

"${compose[@]}" logs --tail=100 dashboard || true
exit 1
