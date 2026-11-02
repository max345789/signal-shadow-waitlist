# DabCloud Movie Workflow Studio

This repository now serves the node-based movie production workflow studio. The frontend lives in `outputs/signal-shadow-waitlist`; Vercel builds it and serves its `dist` directory.

## Local development

```sh
npm --prefix outputs/signal-shadow-waitlist install
npm --prefix outputs/signal-shadow-waitlist run dev
```

## Build

```sh
npm --prefix outputs/signal-shadow-waitlist run build
```

Vercel uses the root `vercel.json` to build the nested frontend. The existing `/api/waitlist` endpoint remains in the repository for compatibility, but the movie studio UI does not use it.

## Accounts and saved workflows

The studio uses Supabase Auth for email/password accounts, email confirmation, and password reset. Passwords are sent directly to Supabase Auth and are never stored by this application. The signed-in user's workflow graph, node instructions, task code, and optimized image references are autosaved to `public.studio_workflows`; Supabase row-level security limits access to the owner.

The canvas header also has a manual **Save** action. The **Terminal** opens a workflow-scoped pipeline console with `help`, `status`, `connect kaggle <url>`, `connect local <url>`, `test <provider>`, `models <provider>`, `save`, and `run` commands. It can check a Kaggle OpenAI-compatible `/v1/models` endpoint and a local Ollama `/api/tags` endpoint. Endpoint URLs are saved with the workflow; bearer tokens are used only for the current browser session and are not persisted. The console does not execute arbitrary computer shell commands. The configured task API remains responsible for dispatching generation jobs to a selected provider adapter.

To enable accounts in production:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for Production, Preview, and Development as needed. These are the Supabase project URL and publishable/anon key; never use a service-role key in a `VITE_` variable.
2. Apply `outputs/signal-shadow-waitlist/supabase/migrations/20261102000000_create_studio_accounts_and_workflows.sql` to that same Supabase project (for example, with the Supabase SQL Editor or `supabase db push`).
3. In Supabase Auth, add the deployed site URL and its redirect URLs. Configure custom SMTP for reliable signup and reset email delivery.
4. Redeploy the Vercel site after setting environment variables.

The frontend build can complete without Supabase credentials, but sign-in and persistent storage stay disabled until those project values and the migration are configured. See `outputs/signal-shadow-waitlist/.env.example`.

## MCP server

The Vercel function at `api/mcp.js` is exposed at `/mcp` through a rewrite. It provides `get_workflow`, `get_task`, and `run_task`. Configure the server-side environment variables in Vercel before connecting a model client. See [MCP_SETUP.md](MCP_SETUP.md).

The signed-in UI uses protected Vercel routes `/api/tasks/{code}` and `/api/tasks/{code}/complete`. They verify the Supabase session and forward task code, provider, graph, attached images, and run ID to `TASK_API_ORIGIN`. The task API must dispatch the provider; HTTP acceptance alone does not prove video generation completed.

Workflow versions and task run history are stored in `studio_workflow_versions` and `studio_runs`. Apply the additive migrations in `outputs/signal-shadow-waitlist/supabase/migrations/` to the studio Supabase project.

## Kaggle Video Model Engine

The production video diffusion model runs on Kaggle via [`sara8877/dabcloudbp-dual-gpu-30s-video-engine`](https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine).

- **Pipeline**: Dual Tesla T4 GPUs (30 GB combined VRAM). Master keyframe generation on GPU 0 with temporal autoregressive segment diffusion on GPU 1 (SVD-XT) + cinematic procedural synthesizer fallback.
- **Output**: Full 30-second 2K (1920x1080) video clips at 24 FPS with H.264 MP4 encoding.
- **Two-Way Bridge**: Connects to the studio using Cloudflare Quick Tunnel over WebSocket (`wss://.../ws`).
- **In-Browser Video Playback**: Generated video outputs are dynamically displayed with inline video players directly on the Video Generation canvas node, the Final Output node, the Node Inspector, and the Task Output dialog.
- **Source Code**: Located under `kaggle/` with `dabcloudbp-dual-gpu-30s-video-engine.py` and `kernel-metadata.json`.

Run unit tests with `npm --prefix outputs/signal-shadow-waitlist test`.

## Legacy waitlist backend

The existing `/api/waitlist` handler and the older Supabase fallback remain in the repository, but the new studio UI does not call them. If the waitlist endpoint is still needed, configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WAITLIST_RATE_LIMIT_MAX`, and `WAITLIST_RATE_LIMIT_WINDOW_SECONDS` in Vercel.
