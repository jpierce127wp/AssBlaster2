CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL
    CHECK (action IN (
      'created', 'updated', 'merged', 'status_changed',
      'reviewed', 'synced', 'failed', 'replayed'
    )),
  actor_type  TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'user', 'pipeline')),
  actor_id    TEXT NOT NULL DEFAULT 'system',
  summary     TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
