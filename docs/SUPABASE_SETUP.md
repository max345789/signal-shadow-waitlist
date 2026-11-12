# Supabase Backend Configuration Guide for Baton

Baton is configured to use Supabase as its full backend:
- **Database**: Supabase managed PostgreSQL via Prisma with Supavisor connection pooling
- **Authentication**: Supabase Auth (Email, Magic Link, and Social OAuth)
- **File Storage**: Supabase Storage (`deal-vault` private bucket with expiring signed URLs)
- **Realtime**: Live Connect Room messaging and stage updates

---

## 1. Supabase Environment Variables

Set the following variables in your local `.env` and in your Vercel Project Environment Variables:

| Variable | Description | Where to find in Supabase Dashboard |
|---|---|---|
| `DATABASE_URL` | Transaction Pooler URL (Port 6543) | **Project Settings** → **Database** → **Connection string** → **URI (Transaction mode)**. Append `?pgbouncer=true`. |
| `DIRECT_URL` | Direct Connection URL (Port 5432) | **Project Settings** → **Database** → **Connection string** → **URI (Session mode)**. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | **Project Settings** → **API** → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public publishable anon key | **Project Settings** → **API** → **Project API keys** → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged secret key (server only) | **Project Settings** → **API** → **Project API keys** → `service_role` |
| `SUPABASE_STORAGE_BUCKET` | Vault storage bucket name | Defaults to `deal-vault` |

### Example `.env`:
```env
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[project-ref].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_STORAGE_BUCKET="deal-vault"
```

---

## 2. Push Database Schema to Supabase

Run the Prisma push command to create all Baton tables, enums, indexes, and relations on your Supabase PostgreSQL database:

```bash
npm run db:push
```

To seed initial sample listings, roles, and verified metrics:

```bash
npm run db:seed
```

---

## 3. Storage Bucket Configuration

1. In Supabase Dashboard, navigate to **Storage** → **New bucket**.
2. Name: `deal-vault`
3. Set **Public bucket** to `OFF` (private, only accessible via signed download URLs).
4. Maximum file size: `25MB`.

---

## 4. Auth URL Configuration

In Supabase Dashboard, navigate to **Authentication** → **URL Configuration**:
- **Site URL**: `https://signal-shadow-waitlist.vercel.app` (or your custom domain `https://dabcloud.in`)
- **Redirect URLs**:
  - `https://signal-shadow-waitlist.vercel.app/api/auth/callback`
  - `https://dabcloud.in/api/auth/callback`
  - `http://localhost:3000/api/auth/callback`
