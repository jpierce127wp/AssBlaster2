CREATE TABLE IF NOT EXISTS review_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_task_id UUID NOT NULL REFERENCES candidate_tasks(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL
    CHECK (reason IN ('low_confidence', 'ambiguous_dedup', 'privilege_flag', 'conflict', 'manual')),
  priority          INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  decided_by        TEXT,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_open ON review_queue(priority DESC, created_at ASC) WHERE status = 'open';
