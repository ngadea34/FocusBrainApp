-- ============================================================================
-- 0004 — Génération asynchrone : tâches, étapes, file, coûts
-- La file est implémentée dans PostgreSQL (FOR UPDATE SKIP LOCKED) :
--   * persistance des états, idempotence (clé par utilisateur + clé d'étape),
--   * retry borné avec backoff exponentiel, bail (lease) pour reprise,
--   * dead-letter (status = 'dead'), annulation, plafond de coût par épisode.
-- Les workers (rôle de service) appellent claim_step / complete_step / fail_step.
-- ============================================================================

create type public.step_type as enum (
  'intent', 'research', 'evaluate_sources', 'outline', 'write', 'verify',
  'synthesize_segment', 'assemble'
);
create type public.step_status as enum ('pending', 'running', 'succeeded', 'failed', 'dead', 'cancelled');

-- ---------------------------------------------------------------------------
-- Machine à états (miroir de packages/contracts/src/status.ts)
-- ---------------------------------------------------------------------------
create or replace function public.is_terminal_status(s public.episode_status) returns boolean
language sql immutable as $$ select s in ('ready', 'failed', 'cancelled') $$;

create or replace function public.is_valid_transition(f public.episode_status, t public.episode_status)
returns boolean language sql immutable as $$
  select case
    when t in ('failed', 'cancelled') then not public.is_terminal_status(f) and f <> 'draft'
    else (f, t) in (
      ('draft', 'queued'), ('failed', 'queued'),
      ('queued', 'researching'),
      ('researching', 'outlining'),
      ('outlining', 'awaiting_approval'), ('outlining', 'writing'),
      ('awaiting_approval', 'writing'),
      ('writing', 'verifying'),
      ('verifying', 'writing'),          -- réécriture après vérification
      ('verifying', 'synthesizing'),
      ('synthesizing', 'assembling'),
      ('assembling', 'synthesizing'),    -- re-synthèse d'un segment défectueux
      ('assembling', 'ready')
    )
  end
$$;

-- ---------------------------------------------------------------------------
-- Tâches de génération (une par lancement)
-- ---------------------------------------------------------------------------
create table public.episode_jobs (
  id                  uuid primary key default gen_random_uuid(),
  episode_id          uuid not null,
  user_id             uuid not null,
  status              public.episode_status not null default 'queued',
  idempotency_key     text not null check (char_length(idempotency_key) between 8 and 128),
  settings_snapshot   jsonb not null,
  plan_code           text not null references public.plans(code),
  quota_period        date not null,
  quota_minutes       integer not null,
  quota_refunded      boolean not null default false,
  cost_cap_micros     bigint not null check (cost_cap_micros > 0),
  cost_spent_micros   bigint not null default 0 check (cost_spent_micros >= 0),
  cancel_requested_at timestamptz,
  error_code          text,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz,
  unique (user_id, idempotency_key),
  unique (id, episode_id),
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create unique index episode_jobs_one_active_per_episode on public.episode_jobs(episode_id)
  where status not in ('ready', 'failed', 'cancelled');
create index episode_jobs_user_active_idx on public.episode_jobs(user_id)
  where status not in ('ready', 'failed', 'cancelled');
create trigger episode_jobs_updated_at before update on public.episode_jobs
  for each row execute function public.set_updated_at();

create table public.generation_steps (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null,
  episode_id      uuid not null,
  user_id         uuid not null,
  step_type       public.step_type not null,
  step_key        text not null default '',       -- ex. index de segment audio
  status          public.step_status not null default 'pending',
  attempts        smallint not null default 0 check (attempts >= 0),
  max_attempts    smallint not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_by       text,
  locked_until    timestamptz,
  input           jsonb not null default '{}'::jsonb,
  input_sha256    text,
  output          jsonb,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (job_id, step_type, step_key),
  foreign key (job_id, episode_id) references public.episode_jobs(id, episode_id) on delete cascade,
  foreign key (episode_id, user_id) references public.episodes(id, user_id) on delete cascade
);
create index generation_steps_claim_idx on public.generation_steps(step_type, next_attempt_at)
  where status = 'pending';
create index generation_steps_lease_idx on public.generation_steps(locked_until)
  where status = 'running';
create index generation_steps_job_idx on public.generation_steps(job_id);
create trigger generation_steps_updated_at before update on public.generation_steps
  for each row execute function public.set_updated_at();

-- Journal des coûts (interne). Anonymisé à la suppression du compte :
-- les montants restent pour la comptabilité, le lien à la personne disparaît.
create table public.cost_events (
  id            bigint generated always as identity primary key,
  -- Références souples (pas de FK) : registre en ajout seul, anonymisé par trigger.
  -- Des FK « on delete set null » entrent en conflit pendant les cascades (bug détecté par test).
  job_id        uuid,
  episode_id    uuid,
  user_id       uuid,
  step_id       uuid,
  category      public.cost_category not null,
  provider      text not null,
  model         text,
  units         numeric(18,4) not null check (units >= 0),
  unit          text not null,                    -- tokens_in, tokens_out, characters, gb_month…
  amount_micros bigint not null check (amount_micros >= 0),   -- micro-USD
  created_at    timestamptz not null default now()
);
create index cost_events_job_idx on public.cost_events(job_id);
create index cost_events_user_month_idx on public.cost_events(user_id, created_at);

-- Anonymisation : à la suppression d'un épisode ou d'un compte, les montants
-- restent (comptabilité, marge agrégée) mais tout lien à la personne disparaît.
create or replace function public.anonymize_cost_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' then
    update public.cost_events set user_id = null, episode_id = null, job_id = null, step_id = null
     where user_id = old.id;
  else
    update public.cost_events set user_id = null, episode_id = null, job_id = null, step_id = null
     where episode_id = old.id;
  end if;
  return old;
end $$;
create trigger episodes_anonymize_costs before delete on public.episodes
  for each row execute function public.anonymize_cost_events();
create trigger profiles_anonymize_costs before delete on public.profiles
  for each row execute function public.anonymize_cost_events();

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------
create or replace function public._set_job_status(p_job_id uuid, p_status public.episode_status,
  p_error_code text default null, p_error_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.episode_jobs;
begin
  select * into j from public.episode_jobs where id = p_job_id for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if j.status = p_status then
    return;                                         -- idempotent
  end if;
  if not public.is_valid_transition(j.status, p_status) then
    raise exception 'invalid_transition: % -> %', j.status, p_status using errcode = 'P0001';
  end if;

  update public.episode_jobs
     set status = p_status,
         error_code = coalesce(p_error_code, error_code),
         error_message = coalesce(left(p_error_message, 1000), error_message),
         finished_at = case when public.is_terminal_status(p_status) then now() else null end
   where id = p_job_id;

  update public.episodes
     set status = p_status,
         ready_at = case when p_status = 'ready' then now() else ready_at end
   where id = j.episode_id;

  if p_status in ('failed', 'cancelled') then
    update public.generation_steps
       set status = 'cancelled', locked_by = null, locked_until = null, finished_at = now()
     where job_id = p_job_id and status = 'pending';
  end if;

  -- Remboursement du quota : échec système, ou annulation avant tout travail coûteux.
  if not j.quota_refunded and (p_status = 'failed' or (p_status = 'cancelled' and j.status = 'queued')) then
    update public.quota_usage
       set generations_used = greatest(generations_used - 1, 0),
           minutes_used = greatest(minutes_used - j.quota_minutes, 0),
           updated_at = now()
     where user_id = j.user_id and period_start = j.quota_period;
    update public.episode_jobs set quota_refunded = true where id = p_job_id;
  end if;
end $$;

create or replace function public.enqueue_step(p_job_id uuid, p_type public.step_type,
  p_key text default '', p_input jsonb default '{}'::jsonb, p_input_sha256 text default null,
  p_max_attempts smallint default 3)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  j public.episode_jobs;
  sid uuid;
begin
  select * into j from public.episode_jobs where id = p_job_id;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  insert into public.generation_steps (job_id, episode_id, user_id, step_type, step_key, input, input_sha256, max_attempts)
  values (j.id, j.episode_id, j.user_id, p_type, coalesce(p_key, ''), p_input, p_input_sha256, p_max_attempts)
  on conflict (job_id, step_type, step_key) do nothing
  returning id into sid;
  if sid is null then                                -- idempotent : étape déjà présente
    select id into sid from public.generation_steps
     where job_id = p_job_id and step_type = p_type and step_key = coalesce(p_key, '');
  end if;
  return sid;
end $$;

-- ---------------------------------------------------------------------------
-- RPC utilisateur
-- ---------------------------------------------------------------------------
create or replace function public.request_generation(p_episode_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.episodes;
  st public.episode_settings;
  pl public.plans;
  existing uuid;
  active_count integer;
  period date := (date_trunc('month', now() at time zone 'utc'))::date;
  job_id uuid;
  reserved integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Idempotence : même clé => même tâche, sans nouvelle consommation.
  select id into existing from public.episode_jobs where user_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then
    return existing;
  end if;

  select * into e from public.episodes where id = p_episode_id and user_id = uid for update;
  if not found then
    raise exception 'episode_not_found' using errcode = 'P0002';
  end if;
  if e.status not in ('draft', 'failed') then
    raise exception 'invalid_state: episode is %', e.status using errcode = 'P0001';
  end if;

  select * into st from public.episode_settings where episode_id = e.id;
  if not found then
    insert into public.episode_settings (episode_id, user_id) values (e.id, uid) returning * into st;
  end if;

  pl := public.effective_plan(uid);
  if pl.code is null then
    raise exception 'no_plan_configured' using errcode = 'P0001';
  end if;
  if st.duration_minutes > pl.max_episode_minutes then
    raise exception 'duration_not_allowed: max % minutes', pl.max_episode_minutes using errcode = 'P0001';
  end if;

  select count(*) into active_count from public.episode_jobs
   where user_id = uid and status not in ('ready', 'failed', 'cancelled');
  if active_count >= pl.max_concurrent_jobs then
    raise exception 'too_many_active_jobs' using errcode = 'P0001';
  end if;

  -- Réservation atomique du quota.
  insert into public.quota_usage (user_id, period_start) values (uid, period) on conflict do nothing;
  update public.quota_usage
     set generations_used = generations_used + 1,
         minutes_used = minutes_used + st.duration_minutes,
         updated_at = now()
   where user_id = uid and period_start = period
     and generations_used + 1 <= pl.monthly_generation_limit
     and minutes_used + st.duration_minutes <= pl.monthly_minutes_limit
  returning generations_used into reserved;
  if reserved is null then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.episode_jobs (episode_id, user_id, status, idempotency_key, settings_snapshot,
                                   plan_code, quota_period, quota_minutes, cost_cap_micros)
  values (e.id, uid, 'queued', p_idempotency_key,
          to_jsonb(st) - 'episode_id' - 'user_id' - 'updated_at'
            || jsonb_build_object('output_locale', e.output_locale, 'research_locales', to_jsonb(e.research_locales)),
          pl.code, period, st.duration_minutes, pl.cost_cap_micros_per_episode)
  returning id into job_id;

  update public.episodes set status = 'queued' where id = e.id;
  perform public.enqueue_step(job_id, 'intent');
  return job_id;
end $$;

create or replace function public.cancel_generation(p_episode_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  j public.episode_jobs;
begin
  select * into j from public.episode_jobs
   where episode_id = p_episode_id and user_id = uid and status not in ('ready', 'failed', 'cancelled')
   for update;
  if not found then
    return;                                         -- rien à annuler : idempotent
  end if;
  update public.episode_jobs set cancel_requested_at = now() where id = j.id;
  perform public._set_job_status(j.id, 'cancelled', 'cancelled_by_user', null);
end $$;

-- Valide le plan proposé, éventuellement après modification par l'utilisateur.
create or replace function public.approve_outline(p_episode_id uuid, p_content jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.episodes;
  j public.episode_jobs;
  ov public.outline_versions;
  new_id uuid;
begin
  select * into e from public.episodes where id = p_episode_id and user_id = uid for update;
  if not found then
    raise exception 'episode_not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'awaiting_approval' then
    raise exception 'invalid_state: episode is %', e.status using errcode = 'P0001';
  end if;
  select * into j from public.episode_jobs where episode_id = e.id and status = 'awaiting_approval';
  select * into ov from public.outline_versions where episode_id = e.id order by version desc limit 1;
  if ov.id is null then
    raise exception 'outline_not_found' using errcode = 'P0002';
  end if;

  if p_content is not null then
    if jsonb_typeof(p_content) <> 'object' or jsonb_typeof(p_content -> 'sections') is distinct from 'array'
       or pg_column_size(p_content) > 65536 then
      raise exception 'invalid_outline' using errcode = '22023';
    end if;
    insert into public.outline_versions (episode_id, user_id, version, author, content, approved_at)
    values (e.id, uid, ov.version + 1, 'user', p_content, now())
    returning id into new_id;
  else
    update public.outline_versions set approved_at = now() where id = ov.id;
    new_id := ov.id;
  end if;

  update public.episodes set approved_outline_version_id = new_id where id = e.id;
  perform public._set_job_status(j.id, 'writing');
  perform public.enqueue_step(j.id, 'write', '', jsonb_build_object('outline_version_id', new_id));
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC workers (rôle de service uniquement)
-- ---------------------------------------------------------------------------
create or replace function public.claim_step(p_worker text, p_types public.step_type[], p_lease_seconds integer default 300)
returns setof public.generation_steps language plpgsql security definer set search_path = '' as $$
begin
  return query
  with cand as (
    select s.id
      from public.generation_steps s
      join public.episode_jobs j on j.id = s.job_id
     where s.step_type = any(p_types)
       and j.cancel_requested_at is null
       and not public.is_terminal_status(j.status)
       and s.attempts < s.max_attempts
       and ((s.status = 'pending' and s.next_attempt_at <= now())
         or (s.status = 'running' and s.locked_until < now()))      -- bail expiré : reprise
     order by s.next_attempt_at
     limit 1
     for update of s skip locked
  )
  update public.generation_steps s
     set status = 'running',
         attempts = s.attempts + 1,
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds)
    from cand
   where s.id = cand.id
  returning s.*;
end $$;

create or replace function public.heartbeat_step(p_step_id uuid, p_worker text, p_lease_seconds integer default 300)
returns boolean language sql security definer set search_path = '' as $$
  update public.generation_steps
     set locked_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_step_id and status = 'running' and locked_by = p_worker
  returning true
$$;

create or replace function public.complete_step(p_step_id uuid, p_worker text, p_output jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.generation_steps
     set status = 'succeeded', output = p_output, locked_by = null, locked_until = null,
         last_error = null, finished_at = now()
   where id = p_step_id and status = 'running' and locked_by = p_worker;
  if not found then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
end $$;

-- Retourne le nouveau statut de l'étape ('pending' = nouvel essai planifié, 'dead' = abandon).
create or replace function public.fail_step(p_step_id uuid, p_worker text, p_error text, p_retryable boolean default true)
returns public.step_status language plpgsql security definer set search_path = '' as $$
declare
  s public.generation_steps;
  next_status public.step_status;
begin
  select * into s from public.generation_steps
   where id = p_step_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;

  next_status := case when p_retryable and s.attempts < s.max_attempts then 'pending' else 'dead' end;

  update public.generation_steps
     set status = next_status,
         last_error = left(p_error, 2000),
         locked_by = null, locked_until = null,
         -- backoff exponentiel : 30 s, 60 s, 120 s… plafonné à 1 h
         next_attempt_at = now() + make_interval(secs => least(30 * power(2, greatest(s.attempts - 1, 0)), 3600)),
         finished_at = case when next_status = 'dead' then now() else null end
   where id = p_step_id;

  if next_status = 'dead' then
    perform public._set_job_status(s.job_id, 'failed', 'step_dead:' || s.step_type::text, p_error);
  end if;
  return next_status;
end $$;

-- Marque « dead » les étapes dont le bail a expiré après le dernier essai autorisé.
create or replace function public.reap_expired_steps()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, job_id, step_type from public.generation_steps
     where status = 'running' and locked_until < now() and attempts >= max_attempts
     for update skip locked
  loop
    update public.generation_steps
       set status = 'dead', last_error = 'lease_expired', locked_by = null, locked_until = null, finished_at = now()
     where id = r.id;
    perform public._set_job_status(r.job_id, 'failed', 'step_dead:' || r.step_type::text, 'lease_expired');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.set_job_status(p_job_id uuid, p_status public.episode_status,
  p_error_code text default null, p_error_message text default null)
returns void language sql security definer set search_path = '' as $$
  select public._set_job_status(p_job_id, p_status, p_error_code, p_error_message)
$$;

-- Enregistre un coût ; retourne false si le plafond de l'épisode est dépassé
-- (le worker doit alors arrêter la génération : statut failed, code cost_cap_exceeded).
create or replace function public.record_cost(p_job_id uuid, p_category public.cost_category, p_provider text,
  p_units numeric, p_unit text, p_amount_micros bigint, p_model text default null, p_step_id uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  j public.episode_jobs;
begin
  update public.episode_jobs set cost_spent_micros = cost_spent_micros + p_amount_micros
   where id = p_job_id returning * into j;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  insert into public.cost_events (job_id, episode_id, user_id, step_id, category, provider, model, units, unit, amount_micros)
  values (j.id, j.episode_id, j.user_id, p_step_id, p_category, p_provider, p_model, p_units, p_unit, p_amount_micros);
  return j.cost_spent_micros <= j.cost_cap_micros;
end $$;

-- ---------------------------------------------------------------------------
-- Vues internes (tableau de bord d'administration, rôle de service)
-- ---------------------------------------------------------------------------
create view public.admin_job_costs with (security_invoker = true) as
select j.id as job_id, j.episode_id, j.user_id, j.status, j.plan_code, j.created_at,
       j.cost_cap_micros, j.cost_spent_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'research'), 0)     as research_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'llm'), 0)          as llm_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'verification'), 0) as verification_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'tts'), 0)          as tts_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'storage'), 0)      as storage_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'egress'), 0)       as egress_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'infra'), 0)        as infra_micros,
       coalesce(sum(c.amount_micros) filter (where c.category = 'license'), 0)      as license_micros
  from public.episode_jobs j
  left join public.cost_events c on c.job_id = j.id
 group by j.id;

create view public.admin_dead_letter_steps with (security_invoker = true) as
select s.id, s.job_id, s.episode_id, s.step_type, s.step_key, s.attempts, s.last_error, s.finished_at
  from public.generation_steps s where s.status = 'dead';

-- ---------------------------------------------------------------------------
-- RLS : l'utilisateur voit ses tâches et l'avancement, jamais les coûts.
-- ---------------------------------------------------------------------------
alter table public.episode_jobs     enable row level security;
alter table public.generation_steps enable row level security;
alter table public.cost_events      enable row level security;  -- aucune politique : service uniquement

create policy jobs_select_own on public.episode_jobs for select to authenticated using (user_id = (select auth.uid()));
create policy steps_select_own on public.generation_steps for select to authenticated using (user_id = (select auth.uid()));
