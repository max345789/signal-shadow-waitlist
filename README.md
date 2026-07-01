# Signal & Shadow Waitlist

The app lives in `outputs/signal-shadow-waitlist`.

## Local Checks

```sh
pnpm --dir outputs/signal-shadow-waitlist test
pnpm --dir outputs/signal-shadow-waitlist build
```

The repository root also has a Vercel bridge build:

```sh
pnpm build
```

## Deployment

Vercel can build from the repository root using `vercel.json`; it installs and builds `outputs/signal-shadow-waitlist`, then serves `outputs/signal-shadow-waitlist/dist`.

The Supabase Edge Function is in:

```txt
outputs/signal-shadow-waitlist/supabase/functions/waitlist-signup
```

Deploy it to the correct Supabase project with JWT verification disabled for this public signup endpoint, matching `supabase/config.toml`.

## Required Environment

Frontend:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEMO_SIGNUP=false
```

Supabase Edge Function:

```txt
RESEND_API_KEY=
WAITLIST_FROM_EMAIL=Maxwel Game Studio <waitlist@example.com>
SITE_URL=https://yoursite.com
WAITLIST_RATE_LIMIT_MAX=5
WAITLIST_RATE_LIMIT_WINDOW_SECONDS=3600
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, the function uses Redis-backed rate limiting. Without them it falls back to in-memory limiting for local/prototype runs.
