CREATE TABLE IF NOT EXISTS canonical_task_field_confidence (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_task_id UUID NOT NULL REFERENCES canonical_tasks(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0 AND confidence <= 1),
  source            TEXT NOT NULL DEFAULT 'system',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(canonical_task_id, field_name)
);

CREATE INDEX idx_field_confidence_task ON canonical_task_field_confidence(canonical_task_id);
