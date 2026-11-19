-- ============================================================================
-- 0003 — Offres, abonnements, quotas, coûts
-- Aucun prix n'est fixé ici : les offres ne portent que des limites techniques.
-- Les montants de l'offre « discovery » sont des valeurs PROVISOIRES de
-- protection anti-abus, à valider après l'étude des coûts (voir DECISIONS.md).
-- Les coûts internes ne sont jamais visibles par les utilisateurs.
-- ============================================================================

create type public.cost_category as enum (
  'research', 'llm', 'verification', 'tts', 'storage', 'egress', 'infra', 'license'
);
create type public.subscription_status as enum ('trialing', 'active', 'grace', 'expired', 'cancelled');
create type public.billing_provider as enum ('none', 'app_store', 'play_store', 'web', 'revenuecat', 'manual');

create table public.plans (
  code                       text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  is_default                 boolean not null default false,
  monthly_generation_limit   integer not null check (monthly_generation_limit >= 0),
  monthly_minutes_limit      integer not null check (monthly_minutes_limit >= 0),
  max_episode_minutes        smallint not null check (max_episode_minutes in (5, 15, 30, 45, 60)),
  max_concurrent_jobs        smallint not null default 1 check (max_concurrent_jobs between 1 and 10),
  cost_cap_micros_per_episode bigint not null check (cost_cap_micros_per_episode > 0), -- micro-USD
  features                   jsonb not null default '{}'::jsonb,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now()
);
create unique index plans_single_default on public.plans(is_default) where is_default;

create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  plan_code          text not null references public.plans(code),
  provider           public.billing_provider not null,
  provider_reference text,
  status             public.subscription_status not null,
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_reference),
  check (current_period_end > current_period_start)
);
create index subscriptions_user_idx on public.subscriptions(user_id, current_period_end desc);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Consommation par période (mois calendaire UTC)
create table public.quota_usage (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  period_start      date not null,
  generations_used  integer not null default 0 check (generations_used >= 0),
  minutes_used      integer not null default 0 check (minutes_used >= 0),
  updated_at        timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- Plan effectif d'un utilisateur : abonnement actif sinon offre par défaut.
create or replace function public.effective_plan(p_user uuid) returns public.plans
language sql stable security definer set search_path = '' as $$
  select p.* from public.plans p
  where p.code = coalesce(
    (select s.plan_code from public.subscriptions s
       where s.user_id = p_user
         and s.status in ('trialing', 'active', 'grace')
         and now() between s.current_period_start and s.current_period_end
       order by s.current_period_end desc limit 1),
    (select code from public.plans where is_default and active limit 1)
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.quota_usage   enable row level security;

create policy plans_read_active on public.plans for select to authenticated using (active);
create policy subs_select_own   on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy quota_select_own  on public.quota_usage   for select to authenticated using (user_id = (select auth.uid()));

-- Valeurs provisoires (anti-abus), à remplacer après étude des coûts.
insert into public.plans (code, is_default, monthly_generation_limit, monthly_minutes_limit,
                          max_episode_minutes, max_concurrent_jobs, cost_cap_micros_per_episode, features)
values ('discovery', true, 3, 45, 15, 1, 2000000, '{"provisional": true}'::jsonb);
