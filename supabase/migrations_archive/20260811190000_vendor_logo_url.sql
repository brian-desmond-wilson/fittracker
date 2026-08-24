-- Vendor logos, so the preferred-vendor picker can be a row of recognisable
-- marks rather than a wall of text chips. You pick a shop by its logo faster
-- than you read its name.
--
-- A URL rather than a bundled asset: vendors are user rows, not a fixed
-- enum — a bundled image map would silently have no answer for the next shop
-- added. The app falls back to a monogram whenever this is null or fails to
-- load, so an unreachable logo degrades to something deliberate-looking
-- instead of a hole.
--
-- Populated by NAME match here rather than from the client, because the
-- matching has to happen where the rows are.

alter table public.nutrition_vendors
  add column if not exists logo_url text;

update public.nutrition_vendors
   set logo_url = 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128'
 where logo_url is null and name ilike '%amazon%';

update public.nutrition_vendors
   set logo_url = 'https://www.costco.com/apple-touch-icon.png'
 where logo_url is null and name ilike '%costco%';

update public.nutrition_vendors
   set logo_url = 'https://www.gussmarket.com/apple-touch-icon.png'
 where logo_url is null and name ilike '%gus%';

update public.nutrition_vendors
   set logo_url = 'https://www.google.com/s2/favicons?domain=thistle.co&sz=128'
 where logo_url is null and name ilike '%thistle%';

update public.nutrition_vendors
   set logo_url = 'https://www.google.com/s2/favicons?domain=instacart.com&sz=128'
 where logo_url is null and name ilike '%instacart%';
