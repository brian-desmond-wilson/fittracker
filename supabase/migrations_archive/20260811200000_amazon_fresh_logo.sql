-- Correct the Amazon Fresh mark.
--
-- The previous URL was amazon.com's favicon, which is the Amazon SHOPPING
-- icon — the orange square and smile. Amazon Fresh is a separate brand with
-- its own logo, and Amazon Fresh has no standalone app or domain to take a
-- favicon from, which is how the wrong mark got there.
--
-- This is the stacked 2020 wordmark from Wikimedia Commons: nearly square
-- (439x404), so it survives being fitted into a circular tile, unlike the
-- horizontal lockup which would shrink to an illegible strip.

update public.nutrition_vendors
   set logo_url = 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Amazon_Fresh_logo_2020_stacked.png'
 where name ilike '%amazon%';
