-- ==========================================================================
-- Zuma en Supabase
--
-- Ejecutá todo este archivo una vez en el SQL Editor del proyecto:
-- https://supabase.com/dashboard/project/jnewregdsxppdzfdvsqb/sql/new
--
-- Crea:
--   * la tabla pública `zuma_docs` (un documento JSON por "archivo")
--   * el bucket público `zuma-media` para las imágenes nuevas
--
-- Seguridad: las políticas de abajo permiten leer y escribir con la clave
-- publicable (anon). Es el mismo nivel de confianza que tenía el token de
-- GitHub en config.js, pero cualquiera con la clave puede escribir. Para una
-- comunidad abierta, el siguiente paso es migrar el login a Supabase Auth y
-- cambiar estas políticas por reglas basadas en auth.uid().
-- ==========================================================================

-- 1) Documentos ------------------------------------------------------------

create table if not exists public.zuma_docs (
  path text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.zuma_docs enable row level security;

drop policy if exists "zuma_docs_read" on public.zuma_docs;
create policy "zuma_docs_read"
  on public.zuma_docs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "zuma_docs_write" on public.zuma_docs;
create policy "zuma_docs_write"
  on public.zuma_docs
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.zuma_docs to anon, authenticated;

-- 2) Imágenes nuevas -------------------------------------------------------
-- Las imágenes viejas siguen en GitHub Pages; las nuevas van a este bucket.

insert into storage.buckets (id, name, public)
values ('zuma-media', 'zuma-media', true)
on conflict (id) do update set public = true;

drop policy if exists "zuma_media_read" on storage.objects;
create policy "zuma_media_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'zuma-media');

drop policy if exists "zuma_media_insert" on storage.objects;
create policy "zuma_media_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'zuma-media');

drop policy if exists "zuma_media_update" on storage.objects;
create policy "zuma_media_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'zuma-media')
  with check (bucket_id = 'zuma-media');

drop policy if exists "zuma_media_delete" on storage.objects;
create policy "zuma_media_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'zuma-media');

-- 3) Comprobación ----------------------------------------------------------
-- Después de ejecutar, esto debe devolver una fila vacía, no un error.

select * from public.zuma_docs limit 1;
