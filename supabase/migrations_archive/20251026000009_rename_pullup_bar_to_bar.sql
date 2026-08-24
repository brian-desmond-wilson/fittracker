-- Migration: Rename Pull-Up Bar to Bar
-- Description: Shortens the name to fit better in the UI

UPDATE equipment SET name = 'Bar' WHERE name = 'Pull-Up Bar';
