CREATE TABLE IF NOT EXISTS action_spans (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_event_id       UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  text                    TEXT NOT NULL,
  start_offset            INTEGER NOT NULL,
  end_offset              INTEGER NOT NULL,
  signal_type             TEXT NOT NULL DEFAULT 'task'
    CHECK (signal_type IN ('task', 'commitment', 'deadline', 'delegation', 'follow_up', 'conditional')),
  extracted_action        TEXT,
  extracted_object        TEXT,
  extracted_assignee_name TEXT,
  extracted_due_text      TEXT,
  confidence              REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_spans_evidence ON action_spans(evidence_event_id);
