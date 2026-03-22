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

if [[ -z "${GITHUB_APP_ID:-}" || -z "${GITHUB_APP_PRIVATE_KEY:-}" ]]; then
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    if [[ -f "/home/ray/.config/gh/hosts.yml" ]]; then
      export GITHUB_TOKEN
      GITHUB_TOKEN="$(
        awk '
          $1=="github.com:" { inhost=1; next }
          inhost && /^[^[:space:]]/ { inhost=0 }
          inhost && $1=="oauth_token:" { print $2; exit }
        ' /home/ray/.config/gh/hosts.yml
      )"
      if [[ -n "$GITHUB_TOKEN" ]]; then
        echo "OpenReactor watchdog is falling back to the GitHub CLI token. Add GitHub App credentials to $ENV_FILE to switch to app auth." >&2
      fi
    fi
    if [[ -z "${GITHUB_TOKEN:-}" ]]; then
      if command -v gh >/dev/null 2>&1; then
        GITHUB_TOKEN="$(gh auth status --show-token 2>/dev/null | sed -n 's/.*Token:[[:space:]]*//p' | head -n1)"
      fi
    fi
    if [[ -z "${GITHUB_TOKEN:-}" ]]; then
      echo "OpenReactor watchdog is missing GitHub auth." >&2
      echo "Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in $ENV_FILE (preferred)," >&2
      echo "or provide GITHUB_TOKEN as a fallback." >&2
      exit 1
    fi
  fi
fi

export OPENREACTOR_ENGINE_ROOT="${OPENREACTOR_ENGINE_ROOT:-$ENGINE_ROOT}"
exec /home/ray/.bun/bin/bun "$ENGINE_ROOT/watchdog/index.ts" "$@"
