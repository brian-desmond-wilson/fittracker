-- Migration: Add Olympic Movement Family
-- Description: Adds "Olympic" movement family for Olympic weightlifting derivatives

-- Add Olympic to movement_families
INSERT INTO movement_families (name, description, display_order) VALUES
  ('Olympic', 'Clean, Snatch, and their derivatives', 21)
ON CONFLICT (name) DO NOTHING;
