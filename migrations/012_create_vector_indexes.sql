-- IVFFlat index for approximate nearest neighbor search on canonical task summary embeddings.
-- Lists = 100 is tuned for up to ~100k tasks; adjust as data grows.
-- Requires at least (lists) rows before the index is effective;
-- fall back to exact search when the table is small.
CREATE INDEX IF NOT EXISTS idx_canonical_tasks_embedding
  ON canonical_tasks
  USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 100);
