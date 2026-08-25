-- Inventory refinement Phase 3 (E1/E2): the AI matcher becomes a legal author
-- of concept links. Widens the matched_by vocabulary with 'ai' so LLM-proposed
-- links are distinguishable from seeds, name-heuristics, and user curation —
-- and individually revocable the same way the backfill's undo comment
-- documents ('delete ... where matched_by = ...').
alter table public.food_concept_links
  drop constraint if exists food_concept_links_matched_by_check;
alter table public.food_concept_links
  add constraint food_concept_links_matched_by_check
  check (matched_by in ('seed', 'auto_name_match', 'user', 'ai'));
