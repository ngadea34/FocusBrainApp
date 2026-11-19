-- ============================================================================
-- 0006 — Suppression de compte : tous les fichiers du dossier de l'utilisateur
-- La suppression ligne à ligne (audio_assets) ne voit pas les fichiers orphelins
-- (ex. worker arrêté entre le dépôt du fichier et l'insertion de la ligne).
-- À la suppression du profil, on met aussi en file tout le dossier {user_id}/.
-- ============================================================================
alter table public.storage_deletion_queue
  add column is_prefix boolean not null default false;

comment on column public.storage_deletion_queue.is_prefix is
  'true : storage_path est un dossier (se termine par /) dont tout le contenu doit être supprimé';

create or replace function public.enqueue_user_storage_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_deletion_queue (storage_bucket, storage_path, is_prefix)
  values ('episode-audio', old.id::text || '/', true);
  return old;
end $$;

create trigger profiles_storage_cleanup after delete on public.profiles
  for each row execute function public.enqueue_user_storage_deletion();

revoke all on function public.enqueue_user_storage_deletion() from public, anon, authenticated;
