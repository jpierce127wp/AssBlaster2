CREATE TABLE IF NOT EXISTS task_evidence_links (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_task_id UUID NOT NULL REFERENCES canonical_tasks(id) ON DELETE CASCADE,
  evidence_event_id UUID NOT NULL REFERENCES evidence_events(id) ON DELETE CASCADE,
  action_span_id    UUID REFERENCES action_spans(id) ON DELETE SET NULL,
  relation_type     TEXT NOT NULL DEFAULT 'supporting'
    CHECK (relation_type IN ('supporting', 'contradictory', 'superseding', 'context')),
  change_impact     TEXT NOT NULL DEFAULT 'none'
    CHECK (change_impact IN ('none', 'minor', 'major', 'override')),
  impacted_fields   TEXT[] NOT NULL DEFAULT '{}',
  rationale         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(canonical_task_id, evidence_event_id)
);

CREATE INDEX idx_task_evidence_links_task ON task_evidence_links(canonical_task_id);
CREATE INDEX idx_task_evidence_links_event ON task_evidence_links(evidence_event_id);
