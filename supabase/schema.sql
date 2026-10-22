-- CardVault V2 schema: authenticated, per-user collections.
-- Run in the NEW CardVault V2 Supabase project, after backing up any data you need.
create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.notes add column if not exists extracted_contact jsonb null;
alter table public.notes add column if not exists extraction_status text null check (extraction_status in ('pending','completed','failed'));
alter table public.notes add column if not exists extraction_model text null;
alter table public.notes add column if not exists extracted_at timestamptz null;
alter table public.notes add column if not exists company_report jsonb null;
alter table public.notes add column if not exists research_sources jsonb null;
alter table public.notes add column if not exists research_status text null check (research_status in ('pending','completed','failed'));
alter table public.notes add column if not exists research_model text null;
alter table public.notes add column if not exists researched_at timestamptz null;

-- Legacy AI fields are retained for backwards compatibility; the new workflows use the columns above.
alter table public.notes add column if not exists ai_analysis jsonb null;
alter table public.notes add column if not exists ai_status text null;
alter table public.notes add column if not exists ai_model text null;
alter table public.notes add column if not exists ai_analyzed_at timestamptz null;

create table if not exists public.note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  storage_path text not null unique,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);
create index if not exists note_images_note_id_idx on public.note_images(note_id);
create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at desc);

alter table public.notes enable row level security;
alter table public.note_images enable row level security;

drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes" on public.notes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own notes" on public.notes;
create policy "Users can create their own notes" on public.notes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes" on public.notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes" on public.notes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can view images for their own notes" on public.note_images;
create policy "Users can view images for their own notes" on public.note_images for select to authenticated using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));
drop policy if exists "Users can create images for their own notes" on public.note_images;
create policy "Users can create images for their own notes" on public.note_images for insert to authenticated with check (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));
drop policy if exists "Users can update images for their own notes" on public.note_images;
create policy "Users can update images for their own notes" on public.note_images for update to authenticated using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid())) with check (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));
drop policy if exists "Users can delete images for their own notes" on public.note_images;
create policy "Users can delete images for their own notes" on public.note_images for delete to authenticated using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-card-images', 'business-card-images', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users can read own business card images" on storage.objects;
create policy "Users can read own business card images" on storage.objects for select to authenticated using (bucket_id = 'business-card-images' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "Users can upload own business card images" on storage.objects;
create policy "Users can upload own business card images" on storage.objects for insert to authenticated with check (bucket_id = 'business-card-images' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "Users can update own business card images" on storage.objects;
create policy "Users can update own business card images" on storage.objects for update to authenticated using (bucket_id = 'business-card-images' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text) with check (bucket_id = 'business-card-images' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "Users can delete own business card images" on storage.objects;
create policy "Users can delete own business card images" on storage.objects for delete to authenticated using (bucket_id = 'business-card-images' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);


-- Encrypted, per-user Gemini API key storage. The raw key is encrypted by FastAPI
-- before it reaches this table. Browser clients have no direct policies for this table.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_api_key_encrypted text null,
  gemini_key_last4 text null,
  gemini_key_updated_at timestamptz null,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
-- Deliberately no authenticated client policies: access is mediated by the authenticated
-- FastAPI backend using the server-side Supabase secret and verified Supabase user ID.
