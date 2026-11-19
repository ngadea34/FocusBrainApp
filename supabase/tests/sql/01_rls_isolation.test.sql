-- Isolation entre utilisateurs : chaque table, chaque rôle.
begin;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
insert into ids values ('a', tests.create_user('a@test.local')), ('b', tests.create_user('b@test.local'));

-- Toutes les tables du schéma public ont la RLS activée
select tests.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
                'RLS activée sur toutes les tables publiques');
select tests.ok((select count(*) from public.profiles) = 2, 'profil créé automatiquement à l''inscription');
select tests.ok((select count(*) from public.user_preferences) = 2, 'préférences créées automatiquement');

-- A crée un épisode et ses paramètres
call tests.as_key('a');
with x as (
  insert into public.episodes (topic_prompt) values ('Pourquoi le ciel est-il bleu ?') returning id) insert into ids select 'ep_a', id from x;
insert into public.episode_settings (episode_id, user_id, depth) values
  ((select v from ids where k = 'ep_a'), (select v from ids where k = 'a'), 'deep');
insert into public.cognitive_profiles (name, depth) values ('Soirée calme', 'synthetic');
select tests.ok((select count(*) from public.episodes) = 1, 'A voit son épisode');
select tests.ok((select user_id from public.episodes) = (select v from ids where k = 'a'), 'user_id rempli par défaut');
select tests.throws($$update public.episodes set status = 'ready'$$, 'A ne peut pas modifier le statut', 'permission denied');
select tests.throws($$insert into public.episodes (topic_prompt, user_id) values ('xxx', (select v from ids where k = 'b'))$$,
                    'A ne peut pas créer un épisode pour B', 'row-level security');
select tests.throws($$select cost_spent_micros from public.episode_jobs$$, 'coûts de tâche invisibles pour l''utilisateur', 'permission denied');
select tests.throws($$select * from public.cost_events$$, 'journal des coûts invisible', 'permission denied');
select tests.throws($$select * from public.storage_deletion_queue$$, 'file de suppression invisible', 'permission denied');
select tests.throws($$select public.claim_step('x', array['intent']::public.step_type[])$$, 'un utilisateur ne peut pas réclamer une étape', 'permission denied');
select tests.throws($$select public.record_cost((select v from ids where k='a'), 'llm', 'x', 1, 'u', 1)$$, 'un utilisateur ne peut pas écrire de coût', 'permission denied');
select tests.throws($$insert into public.episodes (topic_prompt, output_locale) values ('Sujet', 'francais')$$, 'langue non BCP 47 refusée', 'violates check');

-- Le rôle de service produit du contenu pour A
call tests.as_service();
with x as (insert into public.sources (title, url, canonical_key, kind)
  values ('Rayleigh scattering', 'https://example.org/r', 'url:example.org/r', 'reference_book') returning id) insert into ids select 'src', id from x;
insert into public.episode_sources (episode_id, user_id, source_id, quality_tier)
  select (select v from ids where k='ep_a'), (select v from ids where k='a'), (select v from ids where k='src'), 5;
with x as (insert into public.outline_versions (episode_id, user_id, version, author, content)
  select (select v from ids where k='ep_a'), (select v from ids where k='a'), 1, 'system', '{"sections":[]}' returning id) insert into ids select 'ov', id from x;
with x as (insert into public.script_versions (episode_id, user_id, outline_version_id, version, locale, settings_snapshot)
  select (select v from ids where k='ep_a'), (select v from ids where k='a'), (select v from ids where k='ov'), 1, 'fr-FR', '{}' returning id) insert into ids select 'sv', id from x;
with x as (insert into public.script_sections (script_version_id, episode_id, user_id, position, body, body_sha256)
  select (select v from ids where k='sv'), (select v from ids where k='ep_a'), (select v from ids where k='a'), 0, 'Texte', 'h' returning id) insert into ids select 'sec', id from x;
with x as (insert into public.claims (section_id, episode_id, user_id, text, status)
  select (select v from ids where k='sec'), (select v from ids where k='ep_a'), (select v from ids where k='a'), 'La diffusion dépend de λ⁻⁴', 'confirmed' returning id) insert into ids select 'cl', id from x;
insert into public.claim_evidence (claim_id, episode_id, user_id, source_id, support, quote_original, quote_locale)
  select (select v from ids where k='cl'), (select v from ids where k='ep_a'), (select v from ids where k='a'), (select v from ids where k='src'), 'supports', 'proportional to λ^-4', 'en-GB';
insert into public.audio_assets (episode_id, user_id, kind, storage_path)
  select (select v from ids where k='ep_a'), (select v from ids where k='a'), 'full', (select v from ids where k='a') || '/' || (select v from ids where k='ep_a') || '/full.mp3';
insert into storage.objects (bucket_id, name) select 'episode-audio', (select v from ids where k='a') || '/' || (select v from ids where k='ep_a') || '/full.mp3';
select tests.throws($$insert into public.audio_assets (episode_id, user_id, kind, storage_path)
  select (select v from ids where k='ep_a'), (select v from ids where k='a'), 'full', (select v from ids where k='b') || '/x/y.mp3'$$,
  'chemin audio hors du dossier du propriétaire refusé', 'violates check');
select tests.throws($$insert into public.claim_evidence (claim_id, episode_id, user_id, source_id, support, translation)
  select (select v from ids where k='cl'), (select v from ids where k='ep_a'), (select v from ids where k='a'), (select v from ids where k='src'), 'supports', 'traduction'$$,
  'une traduction doit déclarer sa langue', 'violates check');

-- B ne voit rien de A
call tests.as_key('b');
select tests.ok(tests.count('select 1 from public.episodes') = 0, 'B ne voit pas les épisodes de A');
select tests.ok(tests.count('select 1 from public.episode_settings') = 0, 'B ne voit pas les paramètres de A');
select tests.ok(tests.count('select 1 from public.cognitive_profiles') = 0, 'B ne voit pas les profils d''écoute de A');
select tests.ok(tests.count('select 1 from public.profiles') = 1, 'B ne voit que son propre profil');
select tests.ok(tests.count('select 1 from public.sources') = 0, 'B ne voit pas les sources mobilisées par A');
select tests.ok(tests.count('select 1 from public.episode_sources') = 0, 'B: episode_sources isolé');
select tests.ok(tests.count('select 1 from public.outline_versions') = 0, 'B: plans isolés');
select tests.ok(tests.count('select 1 from public.script_versions') = 0, 'B: scripts isolés');
select tests.ok(tests.count('select 1 from public.script_sections') = 0, 'B: sections isolées');
select tests.ok(tests.count('select 1 from public.claims') = 0, 'B: affirmations isolées');
select tests.ok(tests.count('select 1 from public.claim_evidence') = 0, 'B: preuves isolées');
select tests.ok(tests.count('select 1 from public.audio_assets') = 0, 'B: audio isolé');
select tests.ok(tests.count($$select 1 from storage.objects where bucket_id = 'episode-audio'$$) = 0, 'B: fichiers Storage de A invisibles');
with u as (update public.episodes set title = 'piraté' returning 1) select tests.ok((select count(*) from u) = 0, 'B ne peut pas modifier l''épisode de A');
with d as (delete from public.episodes returning 1) select tests.ok((select count(*) from d) = 0, 'B ne peut pas supprimer l''épisode de A');
select tests.throws($$insert into public.listening_progress (user_id, episode_id) values ((select v from ids where k='b'), (select v from ids where k='ep_a'))$$,
                    'B ne peut pas écrire une progression sur l''épisode de A', 'violates foreign key');
select tests.throws($$insert into public.feedback (user_id, episode_id, rating) values ((select v from ids where k='a'), (select v from ids where k='ep_a'), 1)$$,
                    'B ne peut pas laisser un avis au nom de A', 'row-level security');
select tests.throws($$select public.request_generation((select v from ids where k='ep_a'), 'cle-de-b-123')$$,
                    'B ne peut pas lancer la génération de l''épisode de A', 'episode_not_found');

-- A voit tout son contenu
call tests.as_key('a');
select tests.ok(tests.count('select 1 from public.sources') = 1, 'A voit la source liée');
select tests.ok(tests.count('select 1 from public.claims') = 1 and tests.count('select 1 from public.claim_evidence') = 1, 'A voit affirmations et preuves');
select tests.ok(tests.count($$select 1 from storage.objects where bucket_id = 'episode-audio'$$) = 1, 'A voit son fichier Storage');
insert into public.listening_progress (episode_id, user_id, position_ms) select (select v from ids where k='ep_a'), (select v from ids where k='a'), 42000;
insert into public.feedback (episode_id, user_id, rating, dimensions) select (select v from ids where k='ep_a'), (select v from ids where k='a'), 4, '{"pace":3}';
select tests.ok(tests.count('select 1 from public.listening_progress') = 1, 'A enregistre sa progression');
select tests.throws($$update public.audio_assets set storage_path = 'x'$$, 'A ne peut pas modifier un fichier audio', 'permission denied');

-- Anonyme : aucun accès
call tests.as_anon();
select tests.throws($$select * from public.episodes$$, 'anonyme : aucun accès aux épisodes', 'permission denied');
select tests.throws($$select * from public.profiles$$, 'anonyme : aucun accès aux profils', 'permission denied');
call tests.as_owner();
rollback;
