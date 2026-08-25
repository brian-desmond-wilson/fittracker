-- Migration: Add Recovery Movement Families
-- Description: Adds 5 new movement families for the Recovery modality

-- Add new recovery-specific families
INSERT INTO movement_families (name, description, display_order) VALUES
  ('Stretching', 'Static flexibility and cool-down holds', 25),
  ('Foam Rolling', 'Myofascial release and tissue recovery', 26),
  ('Breath Work', 'Controlled breathing for relaxation and recovery', 27),
  ('Activation', 'Light prep or priming drills pre- or post-WOD', 28),
  ('Balance/Stability', 'Controlled movement for proprioception or rehab', 29)
ON CONFLICT (name) DO NOTHING;
