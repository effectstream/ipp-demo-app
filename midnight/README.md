# IPP Midnight workspace

Derived from `effectstream/templates/zk-cardano` (the v-next branch). Replaces
the original `ballot` contract with a minimal `anchor` contract — a single
circuit that writes `key → value` into an on-chain `Map<Bytes<32>, Bytes<32>>`.

```
packages/
├── contracts-midnight/
│   ├── contract-anchor/
│   │   ├── src/anchor.compact      ← the Compact source
│   │   ├── src/witnesses.ts        ← supplies the deployer secret key
│   │   ├── src/managed/            ← `compact` compiler output (committed)
│   │   └── package.json
│   ├── deploy.ts                   ← one-shot deploy script (uses @effectstream/midnight-contracts)
│   └── package.json
├── batcher/
│   ├── batcher.dev.ts              ← Fastify batcher on :3335 by default
│   ├── midnight-balancing.ts       ← wires the MidnightAdapter to our contract
│   └── package.json
├── start.dev.ts                    ← orchestrator config (Midnight node + batcher only)
└── package.json
```

## Contract

```compact
export ledger anchors: Map<Bytes<32>, Bytes<32>>;
export ledger deployer: Bytes<32>;

circuit anchor(key: Bytes<32>, value: Bytes<32>): [] {
  assert(public_key(private$secret_key()) == deployer.read(), "only deployer");
  anchors.insert(disclose(key), disclose(value));
}
```

Convention used by the IPP backend's `MidnightAdapter`:

- `key   = SHA-256(rut)`              — 32 bytes, hex
- `value = SHA-256(canonical patient JSON)` — 32 bytes, hex

Re-inserting an existing key overwrites the previous value (Map semantics),
so the latest patient hash is always at `anchors.lookup(SHA-256(rut))`.

## Compile

The compiler is the `compact` binary (Midnight's Compact toolchain), expected
on PATH. The compiled JS/TS lives under `src/managed/` and is what the batcher
imports at runtime.

```bash
cd packages/contracts-midnight/contract-anchor
bun run compact   # → src/managed/{contract,keys,zkir,compiler}
```

## Run the full stack (Midnight orchestrator)

The orchestrator brings up a local Midnight devnet (node + proof server +
indexer), deploys the anchor contract, and starts the batcher.

```bash
cd /Users/edwardalvarado/ipp/midnight
bun install
# First run downloads the midnight-node / proof-server / indexer binaries
# from @effectstream/npm-midnight-* — takes a few minutes.
bunx orchestrator start --background
bunx orchestrator status

# When ready, the batcher listens on http://localhost:3335 and the IPP
# backend's MidnightAdapter (CHAIN=midnight bun run dev) can post to it.

# To stop everything:
bunx orchestrator stop
```

The deployed contract address is written to
`packages/contracts-midnight/contract-anchor.undeployed.json` and read by the
batcher via `@effectstream/midnight-contracts/read-contract`.

## Reading anchors back (verification)

Writing an anchor is only half the story — to *verify* a record you have to
read `anchors.lookup(SHA-256(rut))` back. [`packages/batcher/read-anchor.ts`](packages/batcher/read-anchor.ts)
does that with a read-only `indexerPublicDataProvider` + the compiled
`Anchor.ledger()` reader (no wallet, no proof server). It's exposed over HTTP
by [`read-server.ts`](packages/batcher/read-server.ts), which starts
automatically alongside the batcher:

```bash
# started with the batcher, or standalone:
bun run --cwd packages/batcher read-server     # listens on :3336

curl http://localhost:3336/anchor/<keyHex>     # → { found, valueHex }
```

The IPP backend's `MidnightAdapter.read()` calls this (`ANCHOR_READ_URL`,
default `http://localhost:3336`) to serve `GET /api/v1/verify/:rut`.

## Verified end-to-end

A submission flowed iOS-client → IPP backend → batcher → `anchor` circuit →
Midnight devnet, with the `anchored_hashes` row in Neon Postgres pinning the
real Midnight transaction hash:

```
chain_tx_id: 3c8568f5d847f2847a2dafb4187fca99ddef10273aebe6095e4182fe5b3c4ab5
chain_name:  midnight
block:       149
took:        ~18s end-to-end (proof gen + tx submit + receipt wait)
dust cost:   250M DUST per anchor (out of 1.25B initial)
```

### Two upstream-template bugs were fixed while getting there

1. **Pass the contract *class*, not an instance.** The zk-cardano template's
   `midnight-balancing.ts` has `new Anchor.Contract(witnesses)` as the 4th
   arg to `MidnightAdapter`, but `MidnightAdapter` later does
   `CompiledContract.make(name, contractClass)` and `new ctor(witnesses)`
   internally — feeding it an instance throws "Contract is not a constructor."
   Pass `Anchor.Contract` directly.

2. **Match the batcher seed to the deployer seed.** The upstream template
   uses `0x01` in `deploy.ts` but `0x02` in `midnight-balancing.ts`. Since
   the contract `assert`s that `public_key(sk) == deployer.read()`, every
   write fails with `failed assert: only deployer can anchor` until both
   match. We use `0x01` everywhere.

## What's still missing

- No state-machine sync side. The on-chain `anchors` ledger can be queried
  directly via the Midnight indexer if/when we want to verify a hash from
  outside the iOS client.
