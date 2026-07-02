# Don't Hang Up Waitlist

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

Vercel builds `outputs/signal-shadow-waitlist` during deployment, serves the generated `dist`, and exposes the first-party API route in `api/waitlist.js`.

## Backend Datastore

The frontend posts signups to:

```txt
/api/waitlist
```

That endpoint stores normalized emails and generated `DHU-XXXXX` player IDs in an Upstash/Vercel KV-compatible Redis datastore. Duplicate email submits return the same player ID, and new signups are rate-limited per connection.

Configure these environment variables in Vercel:

```txt
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
WAITLIST_RATE_LIMIT_MAX=5
WAITLIST_RATE_LIMIT_WINDOW_SECONDS=3600
```

## Legacy Supabase Function

The older Supabase Edge Function remains in the repo as a fallback implementation:

```txt
outputs/signal-shadow-waitlist/supabase/functions/waitlist-signup
```

## Required Environment

Frontend:

```txt
VITE_DEMO_SIGNUP=false
```

Optional legacy Supabase Edge Function:

```txt
RESEND_API_KEY=
WAITLIST_FROM_EMAIL=Maxwel Game Studio <waitlist@example.com>
SITE_URL=https://www.dabcloud.in
WAITLIST_RATE_LIMIT_MAX=5
WAITLIST_RATE_LIMIT_WINDOW_SECONDS=3600
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```
