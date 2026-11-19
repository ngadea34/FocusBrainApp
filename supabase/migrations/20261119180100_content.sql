-- ============================================================================
-- 0002 — Contenu documentaire, plan, script, affirmations, audio, écoute, retours
-- Toutes les tables filles portent episode_id + user_id (clé étrangère composite)
-- pour des politiques RLS simples, indexées et sans récursion.
-- Écriture : rôle de service (workers) sauf listening_progress et feedback.
-- ============================================================================

create type public.source_kind as enum (
  'scientific_article', 'systematic_review', 'public_institution',
  'university', 'reference_book', 'popular_science', 'other'
);
create type public.claim_status as enum ('confirmed', 'nuanced', 'unverified', 'rejected');
create type public.evidence_support as enum ('supports', 'qualifies', 'contradicts');
create type public.audio_kind as enum ('segment', 'full', 'chapter_map', 'transcript');
create type public.asset_status as enum ('pending', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Sources : catalogue partagé (documents publics), sans donnée utilisateur.
-- Une source n'est visible que via un épisode qui la mobilise.
-- ---------------------------------------------------------------------------
create table public.sources (
  id               uuid primary key default gen_random_uuid(),
  kind             public.source_kind not null default 'other',
  title            text not null,
  authors          text[] not null default '{}',
  publisher        text,
  published_on     date,
  original_locale  public.locale_tag,
  url              text,
  doi              text,
  isbn             text,
  canonical_key    text not null unique,          -- doi:..., isbn:..., url:<normalisée>
  metadata         jsonb not null default '{}'::jsonb,
  retrieved_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  check (url is not null or doi is not null or isbn is not null)
);

create table public.episode_sources (
  episode_id       uuid not null,
  user_id          uuid not null,
  source_id        uuid not null references public.sources(id) on delete restrict,
  quality_tier     smallint not null check (quality_tier between 1 and 6),
  relevance_score  numeric(4,3) check (relevance_score between 0 and 1),
  recency_note     text,
  limitations      text,
  evaluation       jsonb not null default '{}'::jsonb,
  retained         boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (episode_id, source_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create index episode_sources_source_idx on public.episode_sources(source_id);
create index episode_sources_user_idx on public.episode_sources(user_id);

-- ---------------------------------------------------------------------------
-- Plans (versions successives ; l'utilisateur peut proposer une version éditée)
-- ---------------------------------------------------------------------------
create table public.outline_versions (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null,
  user_id     uuid not null,
  version     integer not null check (version >= 1),
  author      text not null check (author in ('system', 'user')),
  content     jsonb not null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (episode_id, version),
  unique (id, episode_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);

alter table public.episodes add constraint episodes_approved_outline_fk
  foreign key (approved_outline_version_id, id) references public.outline_versions(id, episode_id)
  on delete set null (approved_outline_version_id) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Scripts et sections
-- ---------------------------------------------------------------------------
create table public.script_versions (
  id                 uuid primary key default gen_random_uuid(),
  episode_id         uuid not null,
  user_id            uuid not null,
  outline_version_id uuid not null,
  version            integer not null check (version >= 1),
  locale             public.locale_tag not null,
  settings_snapshot  jsonb not null,
  created_at         timestamptz not null default now(),
  unique (episode_id, version),
  unique (id, episode_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade,
  foreign key (outline_version_id, episode_id) references public.outline_versions(id, episode_id)
);

alter table public.episodes add constraint episodes_current_script_fk
  foreign key (current_script_version_id, id) references public.script_versions(id, episode_id)
  on delete set null (current_script_version_id) deferrable initially deferred;

create table public.script_sections (
  id                uuid primary key default gen_random_uuid(),
  script_version_id uuid not null,
  episode_id        uuid not null,
  user_id           uuid not null,
  position          integer not null check (position >= 0),
  chapter_title     text,
  body              text not null,
  body_sha256       text not null,                 -- clé de réutilisation audio
  est_duration_ms   integer check (est_duration_ms >= 0),
  created_at        timestamptz not null default now(),
  unique (script_version_id, position),
  unique (id, episode_id),
  foreign key (script_version_id, episode_id) references public.script_versions(id, episode_id) on delete cascade,
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create index script_sections_episode_idx on public.script_sections(episode_id);

-- ---------------------------------------------------------------------------
-- Affirmations et preuves
-- Règle : une affirmation non vérifiée ne doit jamais être présentée comme un
-- fait établi ; le statut est obligatoire et vérifié côté rédaction.
-- ---------------------------------------------------------------------------
create table public.claims (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null,
  episode_id  uuid not null,
  user_id     uuid not null,
  text        text not null,
  status      public.claim_status not null default 'unverified',
  rationale   text,
  checked_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, episode_id),
  foreign key (section_id, episode_id) references public.script_sections(id, episode_id) on delete cascade,
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create index claims_section_idx on public.claims(section_id);
create index claims_episode_status_idx on public.claims(episode_id, status);

create table public.claim_evidence (
  id               uuid primary key default gen_random_uuid(),
  claim_id         uuid not null,
  episode_id       uuid not null,
  user_id          uuid not null,
  source_id        uuid not null,
  support          public.evidence_support not null,
  quote_original   text,                        -- extrait dans la langue de la source
  quote_locale     public.locale_tag,
  translation      text,                        -- jamais présentée comme citation littérale
  translation_locale public.locale_tag,
  locator          text,                        -- page, section, paragraphe…
  created_at       timestamptz not null default now(),
  foreign key (claim_id, episode_id) references public.claims(id, episode_id) on delete cascade,
  foreign key (episode_id, source_id) references public.episode_sources(episode_id, source_id) on delete cascade,
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade,
  check (translation is null or translation_locale is not null)
);
create index claim_evidence_claim_idx on public.claim_evidence(claim_id);

-- ---------------------------------------------------------------------------
-- Fichiers audio (Storage privé, chemin {user_id}/{episode_id}/...)
-- ---------------------------------------------------------------------------
create table public.audio_assets (
  id              uuid primary key default gen_random_uuid(),
  episode_id      uuid not null,
  user_id         uuid not null,
  section_id      uuid,
  kind            public.audio_kind not null,
  status          public.asset_status not null default 'pending',
  storage_bucket  text not null default 'episode-audio',
  storage_path    text not null,
  mime_type       text not null default 'audio/mpeg',
  duration_ms     integer check (duration_ms >= 0),
  byte_size       bigint check (byte_size >= 0),
  tts_provider    text,
  voice_id        text,
  text_sha256     text,                         -- même texte + même voix => réutilisable
  chapters        jsonb,                        -- pour kind = 'full' : [{title, start_ms}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  foreign key (section_id, episode_id) references public.script_sections(id, episode_id) on delete set null (section_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade,
  check (storage_path like user_id::text || '/' || episode_id::text || '/%')
);
create index audio_assets_episode_idx on public.audio_assets(episode_id, kind);
create index audio_assets_reuse_idx on public.audio_assets(episode_id, text_sha256, voice_id) where status = 'ready';
create trigger audio_assets_updated_at before update on public.audio_assets
  for each row execute function public.set_updated_at();

-- File de suppression des objets Storage (Postgres ne peut pas supprimer les
-- fichiers lui-même : un worker vide cette file via l'API Storage).
create table public.storage_deletion_queue (
  id            bigint generated always as identity primary key,
  storage_bucket text not null,
  storage_path  text not null,
  enqueued_at   timestamptz not null default now(),
  processed_at  timestamptz
);

create or replace function public.enqueue_storage_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_deletion_queue (storage_bucket, storage_path)
  values (old.storage_bucket, old.storage_path);
  return old;
end $$;

create trigger audio_assets_storage_cleanup after delete on public.audio_assets
  for each row execute function public.enqueue_storage_deletion();

-- ---------------------------------------------------------------------------
-- Progression d'écoute (indépendante du fichier audio) et retours
-- ---------------------------------------------------------------------------
create table public.listening_progress (
  user_id        uuid not null,
  episode_id     uuid not null,
  position_ms    integer not null default 0 check (position_ms >= 0),
  chapter_index  integer check (chapter_index >= 0),
  playback_rate  numeric(3,2) check (playback_rate between 0.50 and 2.00),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, episode_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create trigger listening_progress_updated_at before update on public.listening_progress
  for each row execute function public.set_updated_at();

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  episode_id  uuid not null,
  rating      smallint check (rating between 1 and 5),
  -- ex. {"clarity":4,"pace":3,"depth_fit":5} — aucune donnée de santé
  dimensions  jsonb not null default '{}'::jsonb,
  comment     text check (char_length(comment) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create index feedback_episode_idx on public.feedback(episode_id);
create trigger feedback_updated_at before update on public.feedback
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sources               enable row level security;
alter table public.episode_sources       enable row level security;
alter table public.outline_versions      enable row level security;
alter table public.script_versions       enable row level security;
alter table public.script_sections       enable row level security;
alter table public.claims                enable row level security;
alter table public.claim_evidence        enable row level security;
alter table public.audio_assets          enable row level security;
alter table public.storage_deletion_queue enable row level security;  -- aucune politique : service uniquement
alter table public.listening_progress    enable row level security;
alter table public.feedback              enable row level security;

create policy sources_select_linked on public.sources for select to authenticated
  using (exists (
    select 1 from public.episode_sources es
    where es.source_id = sources.id and es.user_id = (select auth.uid())
  ));

create policy esources_select_own on public.episode_sources for select to authenticated using (user_id = (select auth.uid()));
create policy outline_select_own  on public.outline_versions for select to authenticated using (user_id = (select auth.uid()));
create policy script_select_own   on public.script_versions  for select to authenticated using (user_id = (select auth.uid()));
create policy section_select_own  on public.script_sections  for select to authenticated using (user_id = (select auth.uid()));
create policy claims_select_own   on public.claims           for select to authenticated using (user_id = (select auth.uid()));
create policy evidence_select_own on public.claim_evidence   for select to authenticated using (user_id = (select auth.uid()));
create policy audio_select_own    on public.audio_assets     for select to authenticated using (user_id = (select auth.uid()));

create policy progress_all_own on public.listening_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy feedback_select_own on public.feedback for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy feedback_update_own on public.feedback for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
