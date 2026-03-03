CREATE TABLE IF NOT EXISTS merge_decisions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_task_id     UUID NOT NULL REFERENCES candidate_tasks(id) ON DELETE CASCADE,
  compared_canonical_id UUID REFERENCES canonical_tasks(id) ON DELETE SET NULL,
  selected_canonical_id UUID REFERENCES canonical_tasks(id) ON DELETE SET NULL,
  outcome               TEXT NOT NULL
    CHECK (outcome IN ('created', 'merged', 'review')),
  fingerprint_score     REAL,
  embedding_score       REAL,
  adjudication_label    TEXT,
  rationale             TEXT,
  created_by            TEXT NOT NULL DEFAULT 'system',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merge_decisions_candidate ON merge_decisions(candidate_task_id);
CREATE INDEX idx_merge_decisions_selected ON merge_decisions(selected_canonical_id);
