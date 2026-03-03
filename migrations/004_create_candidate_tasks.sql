CREATE TABLE IF NOT EXISTS candidate_tasks (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_event_id         UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  action_span_id            UUID REFERENCES action_spans(id) ON DELETE SET NULL,
  canonical_summary         TEXT NOT NULL,
  matter_id                 TEXT,
  contact_id                TEXT,
  client_id                 TEXT,
  action_type               TEXT NOT NULL DEFAULT 'other'
    CHECK (action_type IN ('filing', 'discovery', 'deposition', 'correspondence', 'research', 'meeting', 'review', 'drafting', 'other')),
  target_object             TEXT,
  desired_outcome           TEXT,
  assignee_name             TEXT,
  assignee_user_id          TEXT,
  assignee_resolution_kind  TEXT CHECK (assignee_resolution_kind IN ('extracted', 'resolved', 'rule', 'fallback')),
  due_date_kind             TEXT CHECK (due_date_kind IN ('exact', 'window', 'relative', 'none')),
  due_date_window_start     DATE,
  due_date_window_end       DATE,
  due_date_source_text      TEXT,
  priority                  TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  dependency_text           TEXT,
  source_authority          TEXT NOT NULL DEFAULT 'derived'
    CHECK (source_authority IN ('direct', 'inferred', 'derived')),
  confidence_extraction     REAL NOT NULL DEFAULT 0.0,
  confidence_normalization  REAL NOT NULL DEFAULT 0.0,
  confidence_resolution     REAL NOT NULL DEFAULT 0.0,
  schema_version            INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_tasks_evidence ON candidate_tasks(evidence_event_id);
CREATE INDEX idx_candidate_tasks_action_span ON candidate_tasks(action_span_id);
CREATE INDEX idx_candidate_tasks_matter ON candidate_tasks(matter_id);
