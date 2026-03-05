-- Expand the outcome check constraint to match all MergeOutcome values used by the dedup service.
ALTER TABLE merge_decisions DROP CONSTRAINT merge_decisions_outcome_check;
ALTER TABLE merge_decisions ADD CONSTRAINT merge_decisions_outcome_check
  CHECK (outcome IN ('created', 'merged', 'enriched', 'follow_up', 'review', 'discarded'));
