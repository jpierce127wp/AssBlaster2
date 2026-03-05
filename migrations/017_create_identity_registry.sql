-- Matter registry: master list of legal matters with metadata
CREATE TABLE matter_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_ref      TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  client_name     TEXT,
  practice_area   TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'pending')),
  clio_matter_id  INTEGER,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matter_registry_ref ON matter_registry(matter_ref);
CREATE INDEX idx_matter_registry_aliases ON matter_registry USING GIN (aliases);
CREATE INDEX idx_matter_registry_client ON matter_registry(client_name);

-- User registry: master list of firm users / assignees
CREATE TABLE user_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_ref        TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  email           TEXT,
  role            TEXT,
  department      TEXT,
  clio_user_id    INTEGER,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_registry_ref ON user_registry(user_ref);
CREATE INDEX idx_user_registry_aliases ON user_registry USING GIN (aliases);
CREATE INDEX idx_user_registry_email ON user_registry(email);
