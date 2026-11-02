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

The studio uses Supabase Auth for email/password accounts, Google OAuth, email confirmation, and password reset. Passwords are sent directly to Supabase Auth and are never stored by this application. The signed-in user's workflow graph, node instructions, task code, and optimized image references are autosaved to `public.studio_workflows`; Supabase row-level security limits access to the owner.

The canvas header also has a manual **Save** action. The **Terminal** opens a workflow-scoped pipeline console with `help`, `status`, `connect kaggle <url>`, `connect local <url>`, `test <provider>`, `models <provider>`, `save`, and `run` commands. It can check a Kaggle OpenAI-compatible `/v1/models` endpoint and a local Ollama `/api/tags` endpoint. Endpoint URLs are saved with the workflow; bearer tokens are used only for the current browser session and are not persisted. The console does not execute arbitrary computer shell commands. The configured task API remains responsible for dispatching generation jobs to a selected provider adapter.

To enable accounts in production:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for Production, Preview, and Development as needed. These are the Supabase project URL and publishable/anon key; never use a service-role key in a `VITE_` variable.
2. Apply `outputs/signal-shadow-waitlist/supabase/migrations/20261102000000_create_studio_accounts_and_workflows.sql` to that same Supabase project (for example, with the Supabase SQL Editor or `supabase db push`).
3. In Supabase Auth, add the deployed site URL and its redirect URLs. Configure custom SMTP for reliable signup and reset email delivery. If enabling Google sign-in, configure the Google provider credentials and callback URL there.
4. Redeploy the Vercel site after setting environment variables.

The frontend build can complete without Supabase credentials, but sign-in and persistent storage stay disabled until those project values and the migration are configured. See `outputs/signal-shadow-waitlist/.env.example`.

## MCP server

The Vercel function at `api/mcp.js` is exposed at `/mcp` through a rewrite. It provides `get_workflow`, `get_task`, and `run_task`. Configure the server-side environment variables in Vercel before connecting a model client. See [MCP_SETUP.md](MCP_SETUP.md).

The frontend currently uses `https://mcp.dabcloud.in/api/tasks` for task actions. Keep that API on a separate origin from the Vercel site hosting `/mcp`.

## Legacy waitlist backend

The existing `/api/waitlist` handler and the older Supabase fallback remain in the repository, but the new studio UI does not call them. If the waitlist endpoint is still needed, configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WAITLIST_RATE_LIMIT_MAX`, and `WAITLIST_RATE_LIMIT_WINDOW_SECONDS` in Vercel.
