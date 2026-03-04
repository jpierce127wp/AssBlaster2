ALTER TABLE review_queue
  DROP CONSTRAINT review_queue_reason_check;

ALTER TABLE review_queue
  ADD CONSTRAINT review_queue_reason_check
  CHECK (reason IN ('low_confidence', 'ambiguous_dedup', 'privilege_flag', 'conflict', 'manual', 'weak_identity', 'authority_conflict'));
