-- Read-only MCP access tokens, one set per project. Only the SHA-256 of a token is stored.
CREATE TABLE IF NOT EXISTS project_tokens (
  id              bigserial PRIMARY KEY,
  project_id      bigint NOT NULL REFERENCES projects(id),
  name            text NOT NULL,
  token_hash      text NOT NULL UNIQUE,
  token_hint      text NOT NULL,
  include_private boolean NOT NULL DEFAULT false,
  created_by      bigint REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  use_count       bigint NOT NULL DEFAULT 0,
  revoked_at      timestamptz
);
CREATE INDEX IF NOT EXISTS project_tokens_project_idx ON project_tokens (project_id, id DESC);
