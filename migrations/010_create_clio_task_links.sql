CREATE TABLE IF NOT EXISTS clio_task_links (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clio_task_id          TEXT NOT NULL UNIQUE,
  canonical_task_id     UUID NOT NULL REFERENCES canonical_tasks(id) ON DELETE CASCADE,
  remote_version_token  TEXT,
  last_synced_at        TIMESTAMPTZ,
  sync_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'conflict', 'failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clio_task_links_canonical ON clio_task_links(canonical_task_id);
CREATE INDEX idx_clio_task_links_status ON clio_task_links(sync_status);
