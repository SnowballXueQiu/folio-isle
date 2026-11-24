-- project-scope summaries have library_id NULL: make the dedupe key treat NULLs as equal
ALTER TABLE ai_summaries DROP CONSTRAINT ai_summaries_project_id_scope_library_id_input_hash_model_r_key;
ALTER TABLE ai_summaries ADD CONSTRAINT ai_summaries_dedupe UNIQUE NULLS NOT DISTINCT (project_id, scope, library_id, input_hash, model, rules_version);
