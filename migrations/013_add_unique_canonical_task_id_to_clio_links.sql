ALTER TABLE clio_task_links
  ADD CONSTRAINT uq_clio_task_links_canonical UNIQUE (canonical_task_id);

DROP INDEX IF EXISTS idx_clio_task_links_canonical;
