# Remote MCP setup

The site exposes a stateless MCP Streamable HTTP endpoint at:

```text
https://www.dabcloud.in/mcp
```

Vercel rewrites `/mcp` to the first-party function at `/api/mcp`. The endpoint uses JSON-RPC over HTTP POST, with no server-sent event stream. MCP specifies that GET may return `405 Method Not Allowed` when a server does not provide an SSE stream.

## Available tools

- `get_workflow` returns the canonical seven-step movie pipeline and continuity rules.
- `get_task` reads `GET {TASK_API_ORIGIN}/api/tasks/{task_code}`.
- `run_task` calls `POST {TASK_API_ORIGIN}/api/tasks/{task_code}/complete`, matching the studio's Run button.

`run_task` accepts an optional provider and workflow graph and forwards them to the task API. It does not invoke OpenAI, Gemini, Kaggle, or a local model itself; the task API must handle or queue execution. The studio's signed-in web client uses protected Vercel routes at `/api/tasks/{code}` and `/api/tasks/{code}/complete`, which verify the Supabase session before proxying the task read and run payload. The MCP server only reports completion when the API response indicates it.

The task adapter must accept the six-digit code, selected provider, run ID, graph, and compressed reference images. It must dispatch the chosen model and return a status/output payload. Kaggle WebSocket runs are dispatched directly by the browser to the connected saved notebook bridge.

## Vercel environment variables

Set these under the Vercel project's server-side Environment Variables. Do not use `VITE_` prefixes for secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MCP_ACCESS_TOKEN` | Yes | Secret bearer token required by all MCP POST requests. Generate a strong random token and configure the same value in the model client. |
| `TASK_API_ORIGIN` | Yes for `get_task` and `run_task` | HTTPS origin of the existing task API. Defaults to `https://mcp.dabcloud.in`, matching the current frontend. Keep it separate from the website origin to prevent a proxy loop. |
| `TASK_API_TOKEN` | If required by the task API | Optional bearer token forwarded to the task API. |
| `VITE_SUPABASE_URL` | Studio task routes | Supabase project URL used to verify signed-in users. |
| `VITE_SUPABASE_ANON_KEY` | Studio task routes | Publishable/anon key used for verification with each user's access token. Never use a service-role key. |
| `MCP_ALLOWED_ORIGINS` | Browser clients only | Comma-separated allowlist for browser `Origin` headers. Server-to-server MCP clients without an `Origin` header do not need this. Unlisted origins receive `403`. |

After changing these variables, redeploy the Vercel project so the function receives them.

## Connect a model client

Configure a remote MCP server in the cloud or local model client (replace the host if your Vercel deployment uses another domain):

- Transport: Streamable HTTP
- URL: `https://www.dabcloud.in/mcp`
- Authentication: Bearer token from `MCP_ACCESS_TOKEN`

The model client supplies the model; this function provides workflow/task tools. Cloud, Kaggle, and local model adapters still need their own provider endpoints and credentials.

## Current limits

- `get_workflow` returns the canonical template. The signed-in studio sends its edited graph and photos to its task API route when it runs.
- Task-specific instructions are read from the connected task API. A task record must exist there for `get_task` to return data.
- This function does not store video artifacts or create task folders; those remain responsibilities of the configured task API and model adapter.
- `MCP_ACCESS_TOKEN` is a shared bearer token, not per-user authentication. Treat it as a secret and rotate it if exposed.
