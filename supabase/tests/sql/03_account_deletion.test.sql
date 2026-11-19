-- Suppression de compte : cascade complète, coûts anonymisés, fichiers mis en file de suppression.
begin;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
insert into ids values ('a', tests.create_user('a@test.local'));
call tests.as_key('a');
with x as (insert into public.episodes (topic_prompt) values ('Volcans') returning id) insert into ids select 'e', id from x;
insert into ids select 'j', public.request_generation((select v from ids where k='e'), 'idem-key-del1');
call tests.as_service();
select public.record_cost((select v from ids where k='j'), 'research', 'search-x', 3, 'queries', 1000);
insert into public.audio_assets (episode_id, user_id, kind, storage_path)
  select (select v from ids where k='e'), (select v from ids where k='a'), 'full', (select v from ids where k='a') || '/' || (select v from ids where k='e') || '/full.mp3';
call tests.as_owner();
delete from auth.users where id = (select v from ids where k='a');
select tests.ok(tests.count('select 1 from public.profiles') = 0, 'profil supprimé');
select tests.ok(tests.count('select 1 from public.episodes') = 0, 'épisodes supprimés');
select tests.ok(tests.count('select 1 from public.episode_jobs') = 0 and tests.count('select 1 from public.generation_steps') = 0, 'tâches supprimées');
select tests.ok(tests.count('select 1 from public.quota_usage') = 0, 'consommation supprimée');
select tests.ok((select count(*) from public.cost_events where user_id is null and episode_id is null and job_id is null) = 1, 'coût conservé mais anonymisé');
select tests.ok(tests.count('select 1 from public.storage_deletion_queue where processed_at is null') = 1, 'fichier audio mis en file de suppression');
rollback;
