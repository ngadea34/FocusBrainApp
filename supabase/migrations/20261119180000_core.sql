-- ============================================================================
-- 0001 — Noyau : types, utilitaires, comptes, préférences, épisodes, paramètres
-- Principes :
--  * Aucune donnée de santé : pas de champ diagnostic. Les « profils d'écoute »
--    (table cognitive_profiles) ne contiennent que des préférences explicites.
--  * Chaque table de données personnelles porte user_id et a la RLS activée.
--  * Les statuts sont modifiés uniquement par des fonctions côté serveur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Types énumérés (doivent rester alignés avec packages/contracts — test dédié)
-- ---------------------------------------------------------------------------
create type public.episode_status as enum (
  'draft', 'queued', 'researching', 'outlining', 'awaiting_approval', 'writing',
  'verifying', 'synthesizing', 'assembling', 'ready', 'failed', 'cancelled'
);
create type public.depth_level      as enum ('synthetic', 'intermediate', 'deep', 'expert');
create type public.density_level    as enum ('low', 'medium', 'high');
create type public.structure_kind   as enum ('linear', 'progressive', 'tree');
create type public.digression_level as enum ('minimal', 'moderate', 'developed');
create type public.speech_rate      as enum ('slow', 'moderate', 'fast');
create type public.repetition_level as enum ('low', 'regular', 'frequent');
create type public.narration_tone   as enum ('neutral', 'warm', 'documentary');

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Validation légère d'une étiquette BCP 47 (forme langue[-Script][-REGION]).
-- La canonicalisation complète est faite côté TypeScript (Intl.getCanonicalLocales).
create or replace function public.is_bcp47(tag text) returns boolean
language sql immutable as $$
  select tag ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'
$$;

create domain public.locale_tag as text check (public.is_bcp47(value));

-- ---------------------------------------------------------------------------
-- Profils (1-1 avec auth.users). Créés automatiquement à l'inscription.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text check (char_length(display_name) <= 80),
  interface_locale public.locale_tag not null default 'fr-FR',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profils d'écoute : jeux de paramètres nommés, choisis par l'utilisateur.
-- Jamais déduits d'un diagnostic, jamais pré-remplis selon un trouble.
-- ---------------------------------------------------------------------------
create table public.cognitive_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 60),
  duration_minutes smallint not null default 15 check (duration_minutes in (5, 15, 30, 45, 60)),
  depth            public.depth_level      not null default 'intermediate',
  density          public.density_level    not null default 'medium',
  structure        public.structure_kind   not null default 'progressive',
  digressions      public.digression_level not null default 'moderate',
  speech_rate      public.speech_rate      not null default 'moderate',
  repetition       public.repetition_level not null default 'regular',
  tone             public.narration_tone   not null default 'warm',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);
create index cognitive_profiles_user_idx on public.cognitive_profiles(user_id);
create trigger cognitive_profiles_updated_at before update on public.cognitive_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Préférences applicatives (1-1 avec profiles)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id                    uuid primary key references public.profiles(id) on delete cascade,
  default_output_locale      public.locale_tag not null default 'fr-FR',
  default_research_locales   text[] not null default array['fr-FR', 'en-GB']
                               check (cardinality(default_research_locales) between 1 and 5),
  default_cognitive_profile_id uuid,
  require_outline_approval   boolean not null default true,
  playback_rate              numeric(3,2) not null default 1.00 check (playback_rate between 0.50 and 2.00),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  foreign key (default_cognitive_profile_id, user_id)
    references public.cognitive_profiles(id, user_id) on delete set null (default_cognitive_profile_id)
);
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- Création automatique du profil et des préférences à l'inscription.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Épisodes
-- ---------------------------------------------------------------------------
create table public.episodes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title               text check (char_length(title) <= 200),
  topic_prompt        text not null check (char_length(topic_prompt) between 3 and 2000),
  status              public.episode_status not null default 'draft',
  output_locale       public.locale_tag not null default 'fr-FR',
  research_locales    text[] not null default array['fr-FR', 'en-GB']
                        check (cardinality(research_locales) between 1 and 5),
  cognitive_profile_id uuid,
  approved_outline_version_id uuid,
  current_script_version_id  uuid,
  duration_ms         integer check (duration_ms >= 0),
  ready_at            timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  foreign key (cognitive_profile_id, user_id)
    references public.cognitive_profiles(id, user_id) on delete set null (cognitive_profile_id)
);
create index episodes_user_created_idx on public.episodes(user_id, created_at desc);
create index episodes_status_idx on public.episodes(status) where status not in ('ready', 'failed', 'cancelled', 'draft');
create trigger episodes_updated_at before update on public.episodes
  for each row execute function public.set_updated_at();

-- Paramètres d'un épisode : modifiables uniquement tant que l'épisode est en brouillon.
create table public.episode_settings (
  episode_id       uuid primary key references public.episodes(id) on delete cascade,
  user_id          uuid not null,
  duration_minutes smallint not null default 15 check (duration_minutes in (5, 15, 30, 45, 60)),
  depth            public.depth_level      not null default 'intermediate',
  density          public.density_level    not null default 'medium',
  structure        public.structure_kind   not null default 'progressive',
  digressions      public.digression_level not null default 'moderate',
  speech_rate      public.speech_rate      not null default 'moderate',
  repetition       public.repetition_level not null default 'regular',
  tone             public.narration_tone   not null default 'warm',
  require_outline_approval boolean not null default true,
  updated_at       timestamptz not null default now(),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create trigger episode_settings_updated_at before update on public.episode_settings
  for each row execute function public.set_updated_at();

-- SECURITY INVOKER volontaire : en SECURITY DEFINER, current_user serait le
-- propriétaire de la fonction et le garde-fou serait contourné (bug détecté par test).
create or replace function public.guard_episode_settings() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  s public.episode_status;
begin
  -- Le rôle de service (workers) n'est pas concerné.
  if current_user in ('service_role', 'postgres') then
    return coalesce(new, old);
  end if;
  select status into s from public.episodes where id = coalesce(new.episode_id, old.episode_id);
  if s is distinct from 'draft' then
    raise exception 'episode_locked: settings can only change while the episode is a draft'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger episode_settings_guard before insert or update or delete on public.episode_settings
  for each row execute function public.guard_episode_settings();

-- Le sujet d'un épisode ne peut plus changer une fois la génération demandée.
create or replace function public.guard_episode_update() returns trigger
language plpgsql as $$
begin
  if current_user in ('service_role', 'postgres') then
    return new;
  end if;
  if old.status <> 'draft' and (new.topic_prompt is distinct from old.topic_prompt
      or new.output_locale is distinct from old.output_locale
      or new.research_locales is distinct from old.research_locales) then
    raise exception 'episode_locked: topic and locales can only change while the episode is a draft'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger episodes_guard before update on public.episodes
  for each row execute function public.guard_episode_update();

-- Validation BCP 47 des tableaux de langues
create or replace function public.all_bcp47(tags text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(public.is_bcp47(t)), false) from unnest(tags) t
$$;
alter table public.episodes add constraint episodes_research_locales_bcp47 check (public.all_bcp47(research_locales));
alter table public.user_preferences add constraint prefs_research_locales_bcp47 check (public.all_bcp47(default_research_locales));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.cognitive_profiles enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.episodes          enable row level security;
alter table public.episode_settings  enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy cprof_all_own on public.cognitive_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy prefs_select_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy prefs_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy episodes_select_own on public.episodes for select to authenticated
  using (user_id = (select auth.uid()));
create policy episodes_insert_own on public.episodes for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'draft');
create policy episodes_update_own on public.episodes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy episodes_delete_own on public.episodes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy esettings_all_own on public.episode_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
