-- IPP on-chain anchors, synced from Cardano by the CardanoTransfer primitive.
-- Each row is one anchor tx (label 8327) carrying { t, k, v }:
--   t = kind ("ipp" record anchor | "ipp-study" Merkle root)
--   k = anchor key  (SHA-256(rut) for records, study id for studies)
--   v = anchor value (SHA-256(canonical record) | study Merkle root)
CREATE TABLE ipp_anchors (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  tx_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  anchor_value TEXT NOT NULL,
  raw_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ipp_anchors_key ON ipp_anchors(anchor_key);
CREATE INDEX idx_ipp_anchors_tx ON ipp_anchors(tx_id);
