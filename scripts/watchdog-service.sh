#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/home/ray/projects/openreactor"
ENV_FILE="${OPENREACTOR_ENV_FILE:-/home/ray/.config/openreactor/reactor.env}"

cd "$REPO_ROOT"
NODE_BIN_DIR=""
for candidate in /home/ray/.nvm/versions/node/*/bin/node; do
  if [[ -x "$candidate" ]]; then
    NODE_BIN_DIR="$(dirname "$candidate")"
  fi
done

if [[ -n "$NODE_BIN_DIR" ]]; then
  export PATH="${NODE_BIN_DIR}:/home/ray/.local/bin:/home/ray/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
else
  export PATH="/home/ray/.local/bin:/home/ray/.bun/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

exec /home/ray/.bun/bin/bun /home/ray/projects/openreactor/watchdog/index.ts "$@"
