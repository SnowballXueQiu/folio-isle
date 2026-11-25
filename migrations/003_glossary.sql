-- A glossary (设定) library: its published docs are entries that other docs cross-reference.
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS is_glossary boolean NOT NULL DEFAULT false;
