-- LAVORA 6.0: let people edit and delete THEIR OWN chat messages.
-- Run once in Supabase -> SQL editor. Safe to re-run.

drop policy if exists "members edit own messages" on public.messages;
create policy "members edit own messages" on public.messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "members delete own messages" on public.messages;
create policy "members delete own messages" on public.messages
  for delete to authenticated
  using (author_id = auth.uid());

-- Optional: chat photos / stickers use the existing "post-media" bucket (see README).
-- Make sure that bucket is Public and the upload policy from the README exists.
