#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="${OPENREACTOR_MANAGED_REPO_ROOT:-$ENGINE_ROOT}"
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

export OPENREACTOR_ENGINE_ROOT="${OPENREACTOR_ENGINE_ROOT:-$ENGINE_ROOT}"
exec /home/ray/.bun/bin/bun "$ENGINE_ROOT/watchdog/index.ts" "$@"
