CREATE TABLE IF NOT EXISTS canonical_tasks (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_summary     TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'blocked', 'review_pending', 'complete', 'superseded', 'discarded')),
  fingerprint           JSONB,
  action_type           TEXT NOT NULL DEFAULT 'other'
    CHECK (action_type IN ('filing', 'discovery', 'deposition', 'correspondence', 'research', 'meeting', 'review', 'drafting', 'other')),
  target_object         TEXT,
  desired_outcome       TEXT,
  assignee_user_id      TEXT,
  assignee_role         TEXT,
  priority              TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  due_date_kind         TEXT CHECK (due_date_kind IN ('exact', 'window', 'relative', 'none')),
  due_date_window_start DATE,
  due_date_window_end   DATE,
  matter_id             TEXT,
  open_evidence_count   INTEGER NOT NULL DEFAULT 0,
  last_evidence_at      TIMESTAMPTZ,
  human_edited_at       TIMESTAMPTZ,
  human_edited_by       TEXT,
  schema_version        INTEGER NOT NULL DEFAULT 1,
  summary_embedding     vector(1536),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_canonical_tasks_status ON canonical_tasks(status);
CREATE INDEX idx_canonical_tasks_matter ON canonical_tasks(matter_id);
CREATE INDEX idx_canonical_tasks_assignee ON canonical_tasks(assignee_user_id);
CREATE INDEX idx_canonical_tasks_fingerprint ON canonical_tasks USING GIN (fingerprint);
