-- 言屿 Folio Isle — initial schema

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL,
  provider_uid  text NOT NULL,
  username      text NOT NULL,
  display_name  text,
  avatar_url    text,
  is_site_admin boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, provider_uid)
);
CREATE INDEX users_username_idx ON users (lower(username));

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- one-time OAuth state (consumed with DELETE ... RETURNING)
CREATE TABLE oauth_states (
  state_hash    text PRIMARY KEY,
  code_verifier text NOT NULL,
  return_to     text NOT NULL DEFAULT '/',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users(id)
);

CREATE TABLE projects (
  id                   bigserial PRIMARY KEY,
  slug                 text NOT NULL UNIQUE,
  name                 text NOT NULL,
  description          text NOT NULL DEFAULT '',
  created_by           bigint REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  ai_enabled           boolean NOT NULL DEFAULT false,
  ai_enabled_at        timestamptz,
  ai_paused            boolean NOT NULL DEFAULT false,
  ai_plan_requested_at timestamptz
);

CREATE TABLE project_members (
  project_id bigint NOT NULL REFERENCES projects(id),
  user_id    bigint NOT NULL REFERENCES users(id),
  role       text NOT NULL CHECK (role IN ('admin', 'editor', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

CREATE TABLE libraries (
  id          bigserial PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_public   boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  deleted_by  bigint REFERENCES users(id)
);
CREATE INDEX libraries_project_idx ON libraries (project_id);

CREATE TABLE nodes (
  id                   bigserial PRIMARY KEY,
  library_id           bigint NOT NULL REFERENCES libraries(id),
  parent_id            bigint REFERENCES nodes(id),
  kind                 text NOT NULL CHECK (kind IN ('doc', 'group')),
  title                text NOT NULL,
  position             integer NOT NULL DEFAULT 0,
  head_version_id      bigint,
  published_version_id bigint,
  published_at         timestamptz,
  created_by           bigint REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by           bigint REFERENCES users(id),
  delete_batch         uuid
);
CREATE INDEX nodes_library_idx ON nodes (library_id, parent_id, position);

-- Every saved body version is kept forever (append-only).
CREATE TABLE doc_versions (
  id                bigserial PRIMARY KEY,
  node_id           bigint NOT NULL REFERENCES nodes(id),
  title             text NOT NULL,
  content           text NOT NULL,
  content_hash      text NOT NULL,
  parent_version_id bigint REFERENCES doc_versions(id),
  source            text NOT NULL DEFAULT 'save' CHECK (source IN ('save', 'rollback', 'import')),
  rollback_of       bigint REFERENCES doc_versions(id),
  created_by        bigint REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doc_versions_node_idx ON doc_versions (node_id, id DESC);
ALTER TABLE nodes ADD CONSTRAINT nodes_head_fk FOREIGN KEY (head_version_id) REFERENCES doc_versions(id);
ALTER TABLE nodes ADD CONSTRAINT nodes_pub_fk FOREIGN KEY (published_version_id) REFERENCES doc_versions(id);

-- Attachments are never deleted: historical versions keep referencing them.
CREATE TABLE attachments (
  id          uuid PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id),
  node_id     bigint REFERENCES nodes(id),
  uploaded_by bigint REFERENCES users(id),
  filename    text NOT NULL,
  mime        text NOT NULL,
  size        integer NOT NULL,
  sha256      text NOT NULL,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Directory history (append-only): create / move / reorder / rename / delete / restore
CREATE TABLE tree_events (
  id         bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES projects(id),
  library_id bigint REFERENCES libraries(id),
  node_id    bigint REFERENCES nodes(id),
  actor_id   bigint REFERENCES users(id),
  action     text NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tree_events_project_idx ON tree_events (project_id, id DESC);

-- Business audit (append-only)
CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  project_id  bigint REFERENCES projects(id),
  actor_id    bigint REFERENCES users(id),
  object_type text NOT NULL,
  object_id   text,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_project_idx ON audit_events (project_id, created_at DESC);
CREATE INDEX audit_actor_idx ON audit_events (actor_id, created_at DESC);
CREATE INDEX audit_object_idx ON audit_events (object_type, object_id);

CREATE TABLE comments (
  id         bigserial PRIMARY KEY,
  node_id    bigint NOT NULL REFERENCES nodes(id),
  user_id    bigint NOT NULL REFERENCES users(id),
  parent_id  bigint REFERENCES comments(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at  timestamptz,
  hidden_by  bigint REFERENCES users(id)
);
CREATE INDEX comments_node_idx ON comments (node_id, id);

CREATE TABLE likes (
  node_id    bigint NOT NULL REFERENCES nodes(id),
  user_id    bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, user_id)
);

CREATE TABLE todos (
  id          bigserial PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_id bigint REFERENCES users(id),
  due_date    date,
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  created_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX todos_project_idx ON todos (project_id, status);

CREATE TABLE todo_links (
  todo_id bigint NOT NULL REFERENCES todos(id),
  node_id bigint NOT NULL REFERENCES nodes(id),
  PRIMARY KEY (todo_id, node_id)
);

CREATE TABLE notes (
  id          bigserial PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES projects(id),
  body        text NOT NULL,
  tags        text[] NOT NULL DEFAULT '{}',
  created_by  bigint REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX notes_project_idx ON notes (project_id, created_at DESC);
CREATE INDEX notes_tags_idx ON notes USING gin (tags);

CREATE TABLE note_links (
  note_id bigint NOT NULL REFERENCES notes(id),
  node_id bigint NOT NULL REFERENCES nodes(id),
  PRIMARY KEY (note_id, node_id)
);

-- ===== AI =====
CREATE TABLE ai_doc_analyses (
  id            bigserial PRIMARY KEY,
  project_id    bigint NOT NULL REFERENCES projects(id),
  node_id       bigint NOT NULL REFERENCES nodes(id),
  version_id    bigint NOT NULL REFERENCES doc_versions(id),
  model         text NOT NULL,
  rules_version text NOT NULL,
  result        jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, model, rules_version)
);

CREATE TABLE ai_pair_results (
  id            bigserial PRIMARY KEY,
  project_id    bigint NOT NULL REFERENCES projects(id),
  node_a        bigint NOT NULL REFERENCES nodes(id),
  version_a     bigint NOT NULL REFERENCES doc_versions(id),
  node_b        bigint NOT NULL REFERENCES nodes(id),
  version_b     bigint NOT NULL REFERENCES doc_versions(id),
  model         text NOT NULL,
  rules_version text NOT NULL,
  relation      text NOT NULL CHECK (relation IN ('none', 'supplement', 'prerequisite', 'overlap', 'conflict')),
  direction     text,
  reason        text NOT NULL,
  evidence      jsonb NOT NULL DEFAULT '{}',
  raw_relation  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (node_a < node_b),
  UNIQUE (version_a, version_b, model, rules_version)
);
CREATE INDEX ai_pair_project_idx ON ai_pair_results (project_id);

CREATE TABLE ai_summaries (
  id            bigserial PRIMARY KEY,
  project_id    bigint NOT NULL REFERENCES projects(id),
  scope         text NOT NULL CHECK (scope IN ('library', 'project')),
  library_id    bigint REFERENCES libraries(id),
  input_hash    text NOT NULL,
  inputs        jsonb NOT NULL,
  model         text NOT NULL,
  rules_version text NOT NULL,
  content       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope, library_id, input_hash, model, rules_version)
);

CREATE TABLE ai_tasks (
  id           bigserial PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES projects(id),
  kind         text NOT NULL CHECK (kind IN ('doc', 'pair', 'library', 'project')),
  dedupe_key   text NOT NULL UNIQUE,
  payload      jsonb NOT NULL,
  priority     integer NOT NULL,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  attempts     integer NOT NULL DEFAULT 0,
  throttles    integer NOT NULL DEFAULT 0,
  run_after    timestamptz NOT NULL DEFAULT now(),
  locked_by    text,
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX ai_tasks_claim_idx ON ai_tasks (status, priority, run_after) WHERE status = 'queued';
CREATE INDEX ai_tasks_project_idx ON ai_tasks (project_id, status);

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  seen_at   timestamptz NOT NULL DEFAULT now(),
  info      jsonb NOT NULL DEFAULT '{}'
);

-- ===== append-only guards =====
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER doc_versions_append_only BEFORE UPDATE OR DELETE ON doc_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER doc_versions_no_truncate BEFORE TRUNCATE ON doc_versions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER tree_events_append_only BEFORE UPDATE OR DELETE ON tree_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER tree_events_no_truncate BEFORE TRUNCATE ON tree_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER attachments_append_only BEFORE UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
