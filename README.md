# IPP

iPhone app for doctors and medical staff to capture patient records (Spanish UI),
backed by a Bun HTTP service that stores patients in Neon Postgres and (eventually)
anchors a hash of each record on Midnight so the data can be cryptographically
verified later.

## Repository layout

```
.
├── backend/
│   ├── src/
│   │   ├── server.ts          # Fastify; patient CRUD + anchor endpoints
│   │   ├── db.ts              # postgres connection + schema bootstrap + passcode RNG
│   │   ├── verify.ts          # ed25519 signature verification
│   │   ├── types.ts
│   │   └── adapters/
│   │       ├── local.ts       # No-op chain adapter (default)
│   │       └── midnight.ts    # TODO: wire @effectstream/batcher-sdk
│   ├── .env.example
│   └── package.json
├── ios/
│   ├── IPP/
│   │   ├── Models/            # Patient, Suggestions
│   │   ├── Services/          # APIPatientStore, Wallet, Hasher, AddressSearchModel, ...
│   │   ├── Components/        # MultiSelectAutocomplete, AddressPicker
│   │   ├── Views/             # Root list + 4-tab patient form
│   │   └── Resources/Info.plist
│   └── project.yml            # xcodegen spec
├── web/                       # Vite + React + TS public/patient site
│   ├── src/
│   │   ├── components/        # MapView, LookupForm, PatientDetail
│   │   ├── api.ts             # backend client
│   │   └── types.ts
│   └── vite.config.ts
├── midnight/                  # EffectStream workspace — Compact contract + batcher
│   ├── packages/
│   │   ├── contracts-midnight/contract-anchor/    # Map<Bytes<32>, Bytes<32>> anchor
│   │   └── batcher/                                # @effectstream/batcher-sdk
│   └── start.dev.ts           # orchestrator config (Midnight node + batcher)
└── README.md
```

## Data flow

```
┌──────────────────┐                     ┌──────────────────────┐
│ IPP iPhone app   │                     │ Backend (Bun)        │
│ (SwiftUI)        │  POST /patients     │                      │     ┌──────────────┐
│                  │ ──────────────────▶ │  patients (JSONB)    │ ◀──▶│ Neon Postgres│
│ APIPatientStore  │  GET  /patients     │  anchored_hashes     │     │              │
│ Wallet (ed25519) │ ◀────────────────── │                      │     └──────────────┘
│ Hasher (SHA-256) │  POST /patient-hash │  ChainAdapter        │
│ MapKit picker    │ ──────────────────▶ │   local / midnight   │
└──────────────────┘                     └──────────────────────┘
```

**Patient record.** iOS holds the canonical Swift `Patient` struct (4 tabs of
fields). On save it sends `{ id, rut, latitude, longitude, data: <full patient JSON> }`
to `POST /api/v1/patients`. The backend mirrors `rut`, `latitude`, `longitude`
to columns for indexing/map queries; the full record lives in the `data` JSONB.

**Passcodes.** On first insert the backend generates a 6-digit numeric
passcode and stores it in plaintext on the row (re-fetchable model — see the
README question history). iOS surfaces it in the Datos personales tab with a
copy button so the doctor can share it.

**Hash anchor.** Separately, iOS computes SHA-256 of the canonical JSON
encoding of the patient (passcode field stripped — see `Patient.canonicalCopy()`),
signs `${patientId}|${hash}|${timestamp}` with an in-memory Curve25519 key,
and posts to `/api/v1/patient-hash`. The backend verifies the signature and
appends a row to `anchored_hashes`.

## Endpoints

| Method | Path                              | Notes                                                    |
|--------|-----------------------------------|----------------------------------------------------------|
| GET    | `/health`                         | Liveness                                                 |
| GET    | `/api/v1/patients`                | List (full rows — doctor's view)                         |
| GET    | `/api/v1/patients/:id`            | One row                                                  |
| POST   | `/api/v1/patients`                | Upsert; first insert generates a passcode                |
| DELETE | `/api/v1/patients/:id`            |                                                          |
| GET    | `/api/v1/map-pins`                | Anonymized `{ id, latitude, longitude }` only            |
| POST   | `/api/v1/lookup`                  | `{ rut, passcode }` → full row (404 on mismatch)         |
| POST   | `/api/v1/patient-hash`            | Signed hash anchor (existing)                            |
| GET    | `/api/v1/patient-hash/:patientId` | List anchors for a patient                               |
| GET    | `/api/v1/verify/:rut`             | Read `anchors.lookup(SHA-256(rut))` back from chain; reports chain↔anchored and chain↔current-record match |

## Running it

### Backend

```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL (Neon connection string)
bun install
bun run dev                # http://localhost:3334
```

Quick check:

```bash
curl http://localhost:3334/health
# {"status":"ok","chain":"local","storage":"postgres"}
```

Schema is created on startup (idempotent `CREATE TABLE IF NOT EXISTS`).

### iOS app

```bash
brew install xcodegen      # one-time
cd ios
xcodegen generate
open IPP.xcodeproj
```

### Web app

```bash
cd web
bun install                # one-time
bun run dev                # http://localhost:5173
```

The web app uses Leaflet + OpenStreetMap tiles (no API key) for both the
anonymized map and the per-patient location preview. Backend URL is
`http://localhost:3334` by default; override with the `VITE_BACKEND_URL`
environment variable.

Pick an iPhone simulator and `⌘R`. The app talks to `http://localhost:3334`
by default (controlled by `BackendURL` in `IPP/Resources/Info.plist`).

For a device on your LAN: set `BackendURL` to `http://<your-mac-lan-ip>:3334`
and make sure both devices are on the same network. The Info.plist already
grants ATS exceptions for local-network HTTP.

## Verified on

- iPhone 17 Pro simulator (iOS 26.3) — iOS reads/writes `patients` rows in
  Neon Postgres, passcode (6-digit) surfaces in the Datos personales tab
  with a copy button, MapKit address picker geocodes Chilean addresses and
  renders the map preview.
- Web (Chromium via Claude Preview) — anonymized map shows pins from
  `/api/v1/map-pins`, RUT + passcode lookup hits `/api/v1/lookup` and
  renders the full record (4 sections + per-patient Leaflet map).

## Midnight anchor

The [`midnight/`](midnight/) workspace contains a Compact contract with a
single `anchor(key, value)` circuit and a batcher that posts to it. The
backend's `MidnightAdapter` ([backend/src/adapters/midnight.ts](backend/src/adapters/midnight.ts))
hashes the patient's RUT into the key and submits the iOS-computed patient
hash as the value, so on chain you end up with:

```
anchors: Map<SHA-256(rut) → SHA-256(canonical patient JSON)>
```

See [midnight/README.md](midnight/README.md) for the orchestrator + compile
steps. `CHAIN=midnight` in `backend/.env` flips the backend over to it; the
default `local` adapter remains for development without the full Midnight
stack.

## Verified end-to-end on Midnight

A real anchor went through the full pipeline:

| Layer | Result |
|---|---|
| iOS-style signed POST → IPP backend | 201 in 18.5s |
| Backend → batcher (`POST /send-input`) | accepted |
| Batcher → `anchor(key, value)` on Midnight devnet | confirmed block 149 |
| Neon `anchored_hashes` | row written with `chain_tx_id=3c8568f5…` and `chain_name=midnight` |

See [midnight/README.md](midnight/README.md) for the run steps and the two
upstream-template bugs that needed fixing on the way.

## On-chain verification

`GET /api/v1/verify/:rut` closes the anchor loop: it reads
`anchors.lookup(SHA-256(rut))` back from the Midnight indexer (via a small
read-only service started alongside the batcher — see
[midnight/README.md](midnight/README.md)) and reports two things:

- **chainMatch** — the chain still holds the exact hash we submitted when
  anchoring (chain ↔ `anchored_hashes`).
- **recordMatch** — the patient record *as it stands now* still hashes to the
  on-chain value (chain ↔ current record). If someone edits the stored record
  after it was anchored, this flips to `false`.

The backend recomputes the record hash with a canonical encoder that is
byte-for-byte identical to the iOS `PatientHasher` (locked by a
Foundation-produced test vector in
[`backend/scripts/verify-canonical.ts`](backend/scripts/verify-canonical.ts)),
and the iOS app re-checks independently with its own encoder. Both surface a
"Verificar en cadena" control.

## Roadmap

- **Trustless client-side verification** — have the web client read the
  indexer directly (rather than through the backend) so verification needs no
  trusted server at all.
- **Auth for doctors** — Currently anyone with the backend URL can write
  any patient. Add a doctor-identity layer.

## What's intentionally not done

- **No auth on the doctor-facing endpoints.** Anyone who knows the backend
  URL can list/create/edit any patient. Fine for development, must be fixed
  before any real use.
- **Wallet is regenerated every app launch** (in-memory only).
- **No app icon / launch screen art.**
