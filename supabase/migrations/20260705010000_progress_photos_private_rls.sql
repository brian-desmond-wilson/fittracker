-- Progress photos are body photos — make them private and owner-scoped.
-- Previously the bucket was public with blanket authenticated read/write/delete
-- plus a public-read policy, so any authenticated user (and anyone with a URL)
-- could access them. The app now stores object paths and displays via signed URLs.

update storage.buckets set public = false where id = 'progress-photos';

drop policy if exists "Allow authenticated uploads to progress-photos" on storage.objects;
drop policy if exists "Allow authenticated select from progress-photos" on storage.objects;
drop policy if exists "Allow authenticated update in progress-photos" on storage.objects;
drop policy if exists "Allow authenticated delete from progress-photos" on storage.objects;
drop policy if exists "Allow public select from progress-photos" on storage.objects;

-- Owner-only access, keyed on the <user_id>/ folder prefix of the object name.
create policy "Progress photos: owner select"
  on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Progress photos: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Progress photos: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Progress photos: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
