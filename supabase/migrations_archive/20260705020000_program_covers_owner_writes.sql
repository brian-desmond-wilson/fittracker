-- program-covers are display art (shown on program cards), not sensitive — so
-- reads stay public. But writes/deletes were open to any authenticated user;
-- restrict them to the owner's folder (object name = <user_id>/<file>).

drop policy if exists "Allow authenticated uploads to program-covers" on storage.objects;
drop policy if exists "Allow authenticated update in program-covers" on storage.objects;
drop policy if exists "Allow authenticated delete from program-covers" on storage.objects;

create policy "Program covers: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'program-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Program covers: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'program-covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Program covers: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'program-covers' and (storage.foldername(name))[1] = auth.uid()::text);
