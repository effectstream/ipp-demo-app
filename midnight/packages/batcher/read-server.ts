// Tiny HTTP wrapper around readAnchor() so the IPP backend can verify a
// patient hash against the chain. Decoupled from the batcher's write path:
// it only needs the indexer + the deployed contract address, so it works
// whether or not the batcher write loop is running.
//
// Run standalone:   bun run read-server.ts
// Or it is started automatically alongside the batcher (see batcher.dev.ts).
//
//   GET /health          -> { status, service }
//   GET /anchor/:keyHex   -> { found, valueHex }

import { readAnchor } from "./read-anchor.ts";

const DEFAULT_PORT = 3336;

export function startReadServer(port = Number(process.env.ANCHOR_READ_PORT ?? DEFAULT_PORT)) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "ok", service: "anchor-read" });
      }

      const m = url.pathname.match(/^\/anchor\/([0-9a-fA-F]+)$/);
      if (m && req.method === "GET") {
        try {
          const result = await readAnchor(m[1].toLowerCase());
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 502 },
          );
        }
      }

      return new Response("not found", { status: 404 });
    },
  });

  console.log(`Anchor read server ready on http://localhost:${server.port}`);
  return server;
}

// Start immediately when run directly (bun run read-server.ts).
if (import.meta.main) {
  startReadServer();
}
