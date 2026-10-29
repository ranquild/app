# The environment's agent: the agent server, which runs pi in RPC mode for each conversation, with the mb CLI
# logged in to the environment's Metabase.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git jq ripgrep \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @earendil-works/pi-coding-agent@1.4.0 @metabase/cli \
 && npm cache clean --force

RUN mkdir -p /data/project /app && chown -R node:node /data /app
USER node
WORKDIR /data/project

RUN npx -y skills add metabase/agent-skills --skill metabase-cli --agent pi --global --copy --yes

COPY --chown=node:node server.ts init.sh /app/

ENV MB_CLI_DISABLE_KEYRING=1 \
    PI_SKIP_VERSION_CHECK=1 \
    PI_TELEMETRY=0 \
    NODE_NO_WARNINGS=1

EXPOSE 8080
ENTRYPOINT ["bash", "/app/init.sh"]
