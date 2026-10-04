#!/usr/bin/env bash
set -euo pipefail

CONNECT_URL="${PORCELAIN_CONNECT_URL:-http://127.0.0.1:4195}"
connect_pid=""

if curl -fsS "${CONNECT_URL}/ready" >/dev/null 2>&1; then
  echo "Redpanda Connect already ready at ${CONNECT_URL}"
else
  echo "Starting Redpanda Connect Streams Mode..."
  /home/sachin/.local/bin/.rpk.managed-connect streams --bind-http &
  connect_pid=$!

  cleanup() {
    if [[ -n "${connect_pid}" ]] && kill -0 "${connect_pid}" 2>/dev/null; then
      kill "${connect_pid}" 2>/dev/null || true
      wait "${connect_pid}" 2>/dev/null || true
    fi
  }
  trap cleanup EXIT INT TERM

  for _ in {1..50}; do
    if curl -fsS "${CONNECT_URL}/ready" >/dev/null 2>&1; then
      echo "Redpanda Connect ready at ${CONNECT_URL}"
      break
    fi

    if ! kill -0 "${connect_pid}" 2>/dev/null; then
      echo "Redpanda Connect exited before becoming ready." >&2
      exit 1
    fi

    sleep 0.2
  done

  if ! curl -fsS "${CONNECT_URL}/ready" >/dev/null 2>&1; then
    echo "Redpanda Connect did not become ready at ${CONNECT_URL}." >&2
    exit 1
  fi
fi

echo "Starting Porcelain..."
export PORCELAIN_CONNECT_EXECUTABLE="/home/sachin/.local/bin/.rpk.managed-connect"
export PORCELAIN_RPK_PATH="/home/sachin/.local/bin/rpk"
mise exec -- npm run dev -- --open
