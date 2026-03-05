-- Routing rules for Tier 5 assignment (practice area + action type → assignee)
CREATE TABLE routing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_area   TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  assignee_user_id TEXT,
  assignee_role   TEXT,
  priority        INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_routing_rules_lookup
  ON routing_rules(practice_area, action_type, priority DESC)
  WHERE active = true;
