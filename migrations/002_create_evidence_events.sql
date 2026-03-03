CREATE TABLE IF NOT EXISTS evidence_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key   TEXT NOT NULL UNIQUE,
  source_type       TEXT NOT NULL CHECK (source_type IN ('phone', 'email', 'meeting')),
  raw_text          TEXT NOT NULL,
  cleaned_text      TEXT,
  source_metadata   JSONB NOT NULL DEFAULT '{}',
  participants      JSONB NOT NULL DEFAULT '[]',
  privilege_flags   JSONB NOT NULL DEFAULT '{}',
  matter_hints      TEXT[] NOT NULL DEFAULT '{}',
  contact_hints     TEXT[] NOT NULL DEFAULT '{}',
  processing_state  TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_state IN (
      'received', 'extracted', 'normalized', 'resolved', 'decided', 'failed'
    )),
  schema_version    INTEGER NOT NULL DEFAULT 1,
  source_external_id TEXT,
  source_thread_id  TEXT,
  language          TEXT NOT NULL DEFAULT 'en',
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_timestamp  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_events_state ON evidence_events(processing_state);
CREATE INDEX idx_evidence_events_source ON evidence_events(source_type);
CREATE INDEX idx_evidence_events_received ON evidence_events(received_at DESC);
CREATE INDEX idx_evidence_events_thread ON evidence_events(source_thread_id) WHERE source_thread_id IS NOT NULL;
