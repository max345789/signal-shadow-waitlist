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

## MCP server

The Vercel function at `api/mcp.js` is exposed at `/mcp` through a rewrite. It provides `get_workflow`, `get_task`, and `run_task`. Configure the server-side environment variables in Vercel before connecting a model client. See [MCP_SETUP.md](MCP_SETUP.md).

The frontend currently uses `https://mcp.dabcloud.in/api/tasks` for task actions. Keep that API on a separate origin from the Vercel site hosting `/mcp`.

## Legacy waitlist backend

The existing `/api/waitlist` handler and the older Supabase fallback remain in the repository, but the new studio UI does not call them. If the waitlist endpoint is still needed, configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WAITLIST_RATE_LIMIT_MAX`, and `WAITLIST_RATE_LIMIT_WINDOW_SECONDS` in Vercel.
