import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

// Read API over the synced on-chain anchors (ipp_anchors). The IPP backend and
// the web "Verificar" popup read from here - this is the chain's truth as
// indexed by the CardanoTransfer primitive.
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Latest anchor for a key (SHA-256(rut) for records, study id for studies).
  server.get("/api/anchors/:key", async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      const r = await dbConn.query(
        `SELECT tx_id, block_height, kind, anchor_key, anchor_value, raw_metadata, created_at
         FROM ipp_anchors WHERE anchor_key = $1
         ORDER BY block_height DESC, id DESC LIMIT 1`,
        [key],
      );
      reply.send(r.rows[0] ?? null);
    } catch (e) {
      reply.code(500).send({ error: String(e) });
    }
  });

  // Recent anchors (for debugging / a study list).
  server.get("/api/anchors", async (request, reply) => {
    try {
      const { limit = "100", kind } = request.query as { limit?: string; kind?: string };
      const r = kind
        ? await dbConn.query(
            `SELECT tx_id, block_height, kind, anchor_key, anchor_value, created_at
             FROM ipp_anchors WHERE kind = $1 ORDER BY block_height DESC, id DESC LIMIT $2`,
            [kind, Number(limit)],
          )
        : await dbConn.query(
            `SELECT tx_id, block_height, kind, anchor_key, anchor_value, created_at
             FROM ipp_anchors ORDER BY block_height DESC, id DESC LIMIT $1`,
            [Number(limit)],
          );
      reply.send(r.rows);
    } catch {
      reply.send([]);
    }
  });
};
