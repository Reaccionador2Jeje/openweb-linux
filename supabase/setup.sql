-- Run this in the Supabase SQL Editor before enabling cloud snapshots.
-- The object path must start with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vm-snapshots',
  'vm-snapshots',
  false,
  2147483648,
  array['application/octet-stream']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own VM snapshots" on storage.objects;
create policy "Users can read their own VM snapshots"
on storage.objects for select to authenticated
using (
  bucket_id = 'vm-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload their own VM snapshots" on storage.objects;
create policy "Users can upload their own VM snapshots"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vm-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their own VM snapshots" on storage.objects;
create policy "Users can update their own VM snapshots"
on storage.objects for update to authenticated
using (
  bucket_id = 'vm-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'vm-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own VM snapshots" on storage.objects;
create policy "Users can delete their own VM snapshots"
on storage.objects for delete to authenticated
using (
  bucket_id = 'vm-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
