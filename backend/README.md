# IPP backend

Bun + Fastify HTTP service backing the IPP iOS app and (future) web app.
Stores patients in Neon Postgres; anchors signed hashes via a swappable
`ChainAdapter`. See the top-level [README](../README.md) for the architecture.

## Environment

| Variable       | Default                  | Notes                                                |
|----------------|--------------------------|------------------------------------------------------|
| `DATABASE_URL` | _(required)_             | Postgres connection string. Neon requires `sslmode=require`. |
| `PORT`         | `3334`                   |                                                      |
| `HOST`         | `0.0.0.0`                |                                                      |
| `CHAIN`        | `local`                  | `local` (no-op) or `cardano` (anchors hashes in Cardano tx metadata via the EffectStream/yaci devnet). |
| `CARDANO_*`    | _(see `.env.example`)_   | Dolos/Yaci URLs, pglite read URL, optional wallet seed (when `CHAIN=cardano`). |

## Tables

```sql
patients (
  id UUID PRIMARY KEY,
  rut TEXT UNIQUE NOT NULL,
  passcode TEXT NOT NULL,         -- 6-digit numeric, stored plaintext
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  data JSONB NOT NULL,            -- full Patient record from iOS
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

anchored_hashes (
  id BIGSERIAL PRIMARY KEY,
  patient_id UUID NOT NULL,
  hash TEXT NOT NULL,
  public_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  client_timestamp BIGINT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  chain_tx_id TEXT,
  chain_name TEXT NOT NULL
)
```

Both are created on startup via `IF NOT EXISTS`, so first run against a fresh
Neon database just works.

## Endpoint contracts

See the [main README](../README.md#endpoints) for the full list.
