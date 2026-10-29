# app

Each branch of a Metabase content repo gets an **environment**: a Metabase loaded with that branch, plus a pi agent
logged in to it. You chat with the agent in **conversations**.

```
browser ──▶ app ──▶ provisioner ──▶ environment: metabase + agent
             └──────────────────────────────────────────▲ agent API
```

- **app**: holds the settings and credentials (license, git token, warehouse credentials, model API key), the
  environments, and every conversation's history. Serves the chat UI.
- **provisioner**: an HTTP service that runs environments (docker first; ECS or AgentCore later). It receives
  everything an environment needs in the spec, and reports where its services listen.
- **agent**: an HTTP server in the environment that runs one pi process per open conversation. It keeps nothing the
  app can't resend.

The app calls the provisioner and the agent. Nothing calls the app except the browser.

## Provisioner API

Bearer token: the provisioner's own, held by the app.

```http
POST /environments
{ "metabase": { "env": { "MB_REMOTE_SYNC_BRANCH": "feature-x" },
                "secrets": { "MB_CONFIG_YML": "…", "MB_PREMIUM_EMBEDDING_TOKEN": "…" } },
  "agent":    { "env": { "PI_PROVIDER": "anthropic", "PI_MODEL": "claude-sonnet-5" },
                "secrets": { "PI_API_KEY": "…", "MB_API_KEY": "…", "AGENT_TOKEN": "…" },
                "egress": ["api.anthropic.com"] } }
→ 201 { "id": "env_7f3a", "state": "starting" }

GET /environments/env_7f3a
→ 200 { "id": "env_7f3a", "state": "running",
        "services": { "metabase": "running", "agent": "running" },
        "endpoints": { "metabase": { "kind": "http", "url": "http://127.0.0.1:4101" },
                       "agent":    { "kind": "http", "url": "http://127.0.0.1:4102" } } }

GET /environments
→ 200 { "data": [ { "id": "env_7f3a", "state": "running", … } ] }

PUT /environments/env_7f3a
{ "metabase": { … }, "agent": { … } }
→ 202 { "id": "env_7f3a", "state": "starting" }   new spec; a running environment restarts with it

POST   /environments/env_7f3a/stop            → 202 { "state": "stopping" }   keeps Metabase's app DB and /data
POST   /environments/env_7f3a/start           → 202 { "state": "starting" }
DELETE /environments/env_7f3a                 → 202   removes everything
GET    /environments/env_7f3a/logs?service=agent&tail=200 → 200 text/plain
```

`POST` creates and starts. `PUT` replaces the spec, the whole of it; a stopped environment keeps the new spec for
its next `start`. Secrets are write-only and never returned by `GET`. Every write returns at once; the app polls
`GET` until `state` is `running` or `stopped` (or `error`). The id comes from the provisioner, and the app stores it
on its environment. The provisioner adds what only it knows: Metabase's app DB, the agent's `MB_URL`, and the egress
proxy.

## Agent API

Bearer token: `AGENT_TOKEN` from the spec. Records are pi's own (events, session entries).

```http
POST /conversations
{ "entries": [ { "type": "session", "version": 3, … }, { "type": "message", "id": "a1", … } ] }
→ 201 { "id": "cv_91c2", "state": "idle" }   writes the pi session file and starts pi on it; [] starts a new session

GET /conversations/cv_91c2
→ 200 { "id": "cv_91c2", "state": "running" }

GET /conversations
→ 200 { "data": [ { "id": "cv_91c2", "state": "running" } ] }

PUT /conversations/cv_91c2
{ "entries": [ … ] }
→ 200 { "id": "cv_91c2", "state": "idle" }   replaces the history; 409 while running

POST /conversations/cv_91c2/prompt  { "message": "Build a revenue dashboard" } → 202 { "state": "running" }
POST /conversations/cv_91c2/abort                                             → 202

GET /conversations/cv_91c2/events?after=41
→ 200 text/event-stream
id: 42
data: {"kind":"event","event":{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Sure"}}}

id: 43
data: {"kind":"entry","entry":{"type":"message","id":"b2","parentId":"a1","message":{"role":"assistant",…}}}

DELETE /conversations/cv_91c2   → 204   stops pi, deletes the session file
GET    /ping                    → 200 { "status": "Healthy" }
```

The id is the agent's handle for an open conversation; the app stores it next to its own conversation. The agent
closes idle conversations and loses them all on a restart, so any call can answer `404`: the app then `POST`s the
stored entries again, stores the new id, and retries.
