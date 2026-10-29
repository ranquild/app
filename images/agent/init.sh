#!/usr/bin/env bash
# Logs the mb CLI in to this environment's Metabase, exports the model key under the provider's own variable, then
# starts the agent server.
set -euo pipefail

: "${MB_URL:?}" "${MB_API_KEY:?}" "${PI_PROVIDER:?}" "${PI_MODEL:?}" "${PI_API_KEY:?}" "${AGENT_TOKEN:?}"

case "$PI_PROVIDER" in
  anthropic) export ANTHROPIC_API_KEY="$PI_API_KEY" ;;
  openai) export OPENAI_API_KEY="$PI_API_KEY" ;;
  openrouter) export OPENROUTER_API_KEY="$PI_API_KEY" ;;
  google) export GEMINI_API_KEY="$PI_API_KEY" ;;
  mistral) export MISTRAL_API_KEY="$PI_API_KEY" ;;
  deepseek) export DEEPSEEK_API_KEY="$PI_API_KEY" ;;
  *) echo "Unsupported provider $PI_PROVIDER" >&2; exit 1 ;;
esac
unset PI_API_KEY

mkdir -p /data/project
cat > /data/project/AGENTS.md <<EOF
# This environment

You work on one Metabase through the \`mb\` CLI, which is already logged in (as an admin, with an API key) at
${MB_URL}. Load the \`metabase-cli\` skill before using it.

People open this Metabase in their browser at ${MB_PUBLIC_URL:-$MB_URL}. When you link to anything in it (a
dashboard, a question, a collection), build the link with that base URL, never with ${MB_URL}.
EOF

for attempt in $(seq 1 300); do
  if printf '%s' "$MB_API_KEY" | mb auth login --url "$MB_URL" >/dev/null 2>&1; then
    echo "mb CLI logged in to $MB_URL."
    break
  fi
  if [ "$attempt" = 300 ]; then
    echo "mb CLI could not log in to $MB_URL." >&2
    exit 1
  fi
  sleep 2
done

exec node /app/server.ts
