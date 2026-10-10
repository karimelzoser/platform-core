#!/usr/bin/env sh
set -eu

web_url='http://127.0.0.1:3000'
api_url='http://127.0.0.1:4000/health'

if curl --fail --silent "$web_url" >/dev/null 2>&1 \
  && curl --fail --silent "$api_url" >/dev/null 2>&1; then
  echo 'Codespaces preview is already healthy.'
  exit 0
fi

# A Codespace can be resumed with stale nohup processes or Compose state.
# Clean that disposable preview state before rebuilding it from the current branch.
corepack pnpm preview:down >/dev/null 2>&1 || true
corepack pnpm preview:up
corepack pnpm preview:health

echo 'Codespaces preview is ready on forwarded port 3000.'
