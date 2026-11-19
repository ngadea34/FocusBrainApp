-- ============================================================================
-- 0005 — Storage privé et droits explicites
-- Supabase accorde par défaut ALL sur le schéma public à anon et authenticated.
-- On retire tout, puis on accorde colonne par colonne : la RLS filtre les
-- lignes, les GRANT limitent les colonnes modifiables (ex. status, coûts).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Storage : bucket privé, chemin {user_id}/{episode_id}/{fichier}
-- Lecture par le propriétaire uniquement (URLs signées générées côté serveur),
-- écriture réservée aux workers (rôle de service, qui contourne la RLS).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('episode-audio', 'episode-audio', false, 524288000,
        array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'application/json', 'text/vtt'])
on conflict (id) do nothing;

create policy episode_audio_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'episode-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Droits : on part de zéro
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lecture
grant select on public.profiles, public.cognitive_profiles, public.user_preferences,
                public.episodes, public.episode_settings, public.sources, public.episode_sources,
                public.outline_versions, public.script_versions, public.script_sections,
                public.claims, public.claim_evidence, public.audio_assets,
                public.listening_progress, public.feedback,
                public.plans, public.subscriptions, public.quota_usage
  to authenticated;

-- Tâches et étapes : avancement visible, coûts et entrées internes masqués.
grant select (id, episode_id, user_id, status, error_code, created_at, updated_at, finished_at)
  on public.episode_jobs to authenticated;
grant select (id, job_id, episode_id, step_type, step_key, status, attempts, created_at, updated_at, finished_at)
  on public.generation_steps to authenticated;

-- Écriture limitée aux colonnes sûres
grant update (display_name, interface_locale) on public.profiles to authenticated;
grant insert, update, delete on public.cognitive_profiles to authenticated;
grant update (default_output_locale, default_research_locales, default_cognitive_profile_id,
              require_outline_approval, playback_rate) on public.user_preferences to authenticated;
grant insert (user_id, title, topic_prompt, output_locale, research_locales, cognitive_profile_id)
  on public.episodes to authenticated;
grant update (title, topic_prompt, output_locale, research_locales, cognitive_profile_id)
  on public.episodes to authenticated;
grant delete on public.episodes to authenticated;
grant insert (episode_id, user_id, duration_minutes, depth, density, structure, digressions,
              speech_rate, repetition, tone, require_outline_approval) on public.episode_settings to authenticated;
grant update (duration_minutes, depth, density, structure, digressions, speech_rate, repetition,
              tone, require_outline_approval) on public.episode_settings to authenticated;
grant insert (user_id, episode_id, position_ms, chapter_index, playback_rate, completed_at),
      update (position_ms, chapter_index, playback_rate, completed_at) on public.listening_progress to authenticated;
grant insert (user_id, episode_id, rating, dimensions, comment),
      update (rating, dimensions, comment) on public.feedback to authenticated;

-- RPC exposées aux utilisateurs
grant execute on function public.request_generation(uuid, text) to authenticated;
grant execute on function public.cancel_generation(uuid)        to authenticated;
grant execute on function public.approve_outline(uuid, jsonb)   to authenticated;
-- Utilisées dans les politiques/contraintes : exécution nécessaire, sans effet de bord.
grant execute on function public.is_bcp47(text), public.all_bcp47(text[]),
                          public.is_terminal_status(public.episode_status),
                          public.is_valid_transition(public.episode_status, public.episode_status)
  to authenticated;
