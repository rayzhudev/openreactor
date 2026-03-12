#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${OPENREACTOR_ENV_FILE:-/home/ray/.config/openreactor/reactor.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

TUNNEL_ID="${OPENREACTOR_STATUS_TUNNEL_ID:-}"
HOSTNAME="${OPENREACTOR_STATUS_PUBLIC_HOSTNAME:-}"
CREDENTIALS_FILE="${OPENREACTOR_STATUS_TUNNEL_CREDENTIALS_FILE:-}"
LOCAL_PORT="${OPENREACTOR_STATUS_PORT:-8789}"

if [[ -z "$TUNNEL_ID" ]]; then
  echo "Missing OPENREACTOR_STATUS_TUNNEL_ID" >&2
  exit 1
fi

if [[ -z "$HOSTNAME" ]]; then
  echo "Missing OPENREACTOR_STATUS_PUBLIC_HOSTNAME" >&2
  exit 1
fi

if [[ -z "$CREDENTIALS_FILE" ]]; then
  echo "Missing OPENREACTOR_STATUS_TUNNEL_CREDENTIALS_FILE" >&2
  exit 1
fi

if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "Missing tunnel credentials file: $CREDENTIALS_FILE" >&2
  exit 1
fi

TMP_CONFIG="$(mktemp)"
cleanup() {
  rm -f "$TMP_CONFIG"
}
trap cleanup EXIT

cat >"$TMP_CONFIG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

ingress:
  - hostname: ${HOSTNAME}
    service: http://127.0.0.1:${LOCAL_PORT}
  - service: http_status:404
EOF

exec /usr/local/bin/cloudflared --no-autoupdate --config "$TMP_CONFIG" tunnel run
