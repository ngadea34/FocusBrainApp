-- Flux de génération : idempotence, quotas, machine à états, file, retry, DLQ, coûts, annulation.
begin;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon, service_role;
insert into ids values ('a', tests.create_user('a@test.local')), ('b', tests.create_user('b@test.local'));

call tests.as_key('a');
with x as (insert into public.episodes (topic_prompt) values ('Histoire du zéro') returning id) insert into ids select 'e1', id from x;
with x as (insert into public.episodes (topic_prompt) values ('Les marées') returning id) insert into ids select 'e2', id from x;
insert into public.episode_settings (episode_id, user_id, duration_minutes) select (select v from ids where k='e1'), (select v from ids where k='a'), 15;
insert into public.episode_settings (episode_id, user_id, duration_minutes) select (select v from ids where k='e2'), (select v from ids where k='a'), 30;

-- Lancement + idempotence
insert into ids select 'j1', public.request_generation((select v from ids where k='e1'), 'idem-key-0001');
select tests.ok(public.request_generation((select v from ids where k='e1'), 'idem-key-0001') = (select v from ids where k='j1'), 'même clé d''idempotence => même tâche');
select tests.ok((select generations_used from public.quota_usage) = 1, 'quota consommé une seule fois');
select tests.ok((select minutes_used from public.quota_usage) = 15, 'minutes réservées');
select tests.ok((select status from public.episodes where id = (select v from ids where k='e1')) = 'queued', 'épisode en file');
select tests.ok(tests.count($$select 1 from public.generation_steps where step_type = 'intent' and status = 'pending'$$) = 1, 'première étape planifiée');
select tests.throws($$update public.episode_settings set depth = 'expert' where episode_id = (select v from ids where k='e1')$$, 'paramètres verrouillés après lancement', 'episode_locked');
select tests.throws($$update public.episodes set topic_prompt = 'autre' where id = (select v from ids where k='e1')$$, 'sujet verrouillé après lancement', 'episode_locked');
update public.episodes set title = 'Le zéro' where id = (select v from ids where k='e1');
select tests.ok((select title from public.episodes where id = (select v from ids where k='e1')) = 'Le zéro', 'le titre reste modifiable');
select tests.throws($$select public.request_generation((select v from ids where k='e2'), 'idem-key-0002')$$, 'durée au-delà de l''offre refusée', 'duration_not_allowed');
update public.episode_settings set duration_minutes = 5 where episode_id = (select v from ids where k='e2');
select tests.throws($$select public.request_generation((select v from ids where k='e2'), 'idem-key-0003')$$, 'une seule génération simultanée (offre découverte)', 'too_many_active_jobs');

-- Worker : réclamation et bail
call tests.as_service();
select tests.ok((select step_type from public.claim_step('w1', array['intent']::public.step_type[])) = 'intent', 'w1 réclame l''étape');
select tests.ok(tests.count($$select * from public.claim_step('w2', array['intent']::public.step_type[])$$) = 0, 'étape verrouillée : w2 n''obtient rien');
select tests.throws($$select public.complete_step((select id from public.generation_steps where step_type='intent'), 'w2', '{}')$$, 'w2 ne peut pas terminer l''étape de w1', 'lease_lost');
-- bail expiré => reprise par w2
update public.generation_steps set locked_until = now() - interval '1 second' where step_type = 'intent';
select tests.ok((select attempts from public.claim_step('w2', array['intent']::public.step_type[])) = 2, 'bail expiré : w2 reprend (essai 2)');
select public.complete_step((select id from public.generation_steps where step_type='intent'), 'w2', '{"themes":["zéro"]}');
select tests.ok((select status from public.generation_steps where step_type='intent') = 'succeeded', 'étape terminée');

-- Machine à états
select tests.throws($$select public.set_job_status((select v from ids where k='j1'), 'ready')$$, 'transition queued -> ready refusée', 'invalid_transition');
select public.set_job_status((select v from ids where k='j1'), 'researching');
select public.set_job_status((select v from ids where k='j1'), 'researching');  -- idempotent
select public.set_job_status((select v from ids where k='j1'), 'outlining');
insert into public.outline_versions (episode_id, user_id, version, author, content)
  select (select v from ids where k='e1'), (select v from ids where k='a'), 1, 'system', '{"sections":[{"title":"Origines"}]}';
select public.set_job_status((select v from ids where k='j1'), 'awaiting_approval');

-- Validation du plan par l'utilisateur (avec modification)
call tests.as_key('b');
select tests.throws($$select public.approve_outline((select v from ids where k='e1'))$$, 'B ne peut pas valider le plan de A', 'episode_not_found');
call tests.as_key('a');
select tests.throws($$select public.approve_outline((select v from ids where k='e1'), '{"oops":1}')$$, 'plan modifié invalide refusé', 'invalid_outline');
select public.approve_outline((select v from ids where k='e1'), '{"sections":[{"title":"Origines"},{"title":"Inde"}]}');
select tests.ok((select author from public.outline_versions where version = 2) = 'user', 'version éditée par l''utilisateur conservée');
select tests.ok((select status from public.episodes where id = (select v from ids where k='e1')) = 'writing', 'rédaction lancée après validation');
select tests.ok((select approved_outline_version_id from public.episodes where id = (select v from ids where k='e1'))
                = (select id from public.outline_versions where version = 2), 'plan validé référencé');

-- Retry borné, backoff, dead-letter, remboursement du quota
call tests.as_service();
select public.claim_step('w1', array['write']::public.step_type[]);
select tests.ok(public.fail_step((select id from public.generation_steps where step_type='write'), 'w1', 'timeout fournisseur') = 'pending', 'échec 1 : nouvel essai planifié');
select tests.ok((select next_attempt_at > now() from public.generation_steps where step_type='write'), 'backoff appliqué');
select tests.ok(tests.count($$select * from public.claim_step('w1', array['write']::public.step_type[])$$) = 0, 'pas de reprise avant la fin du backoff');
update public.generation_steps set next_attempt_at = now() where step_type = 'write';
select public.claim_step('w1', array['write']::public.step_type[]);
select tests.ok(public.fail_step((select id from public.generation_steps where step_type='write'), 'w1', 'erreur 2') = 'pending', 'échec 2 : nouvel essai');
update public.generation_steps set next_attempt_at = now() where step_type = 'write';
select public.claim_step('w1', array['write']::public.step_type[]);
select tests.ok(public.fail_step((select id from public.generation_steps where step_type='write'), 'w1', 'erreur 3') = 'dead', 'échec 3 : dead-letter');
select tests.ok(tests.count('select 1 from public.admin_dead_letter_steps') = 1, 'visible dans la DLQ');
select tests.ok((select status from public.episode_jobs where id = (select v from ids where k='j1')) = 'failed', 'tâche en échec');
select tests.ok((select generations_used from public.quota_usage) = 0, 'quota remboursé après échec système');

-- Relance après échec (nouvelle tâche, nouvelle clé), puis plafond de coût
call tests.as_key('a');
insert into ids select 'j2', public.request_generation((select v from ids where k='e1'), 'idem-key-0004');
call tests.as_service();
select tests.ok(public.record_cost((select v from ids where k='j2'), 'llm', 'anthropic', 12000, 'tokens_out', 1500000, 'model-x'), 'coût sous le plafond');
select tests.ok(not public.record_cost((select v from ids where k='j2'), 'tts', 'tts-x', 90000, 'characters', 600000), 'plafond de coût détecté');
select tests.ok((select llm_micros + tts_micros from public.admin_job_costs where job_id = (select v from ids where k='j2')) = 2100000, 'coûts ventilés par catégorie');

-- Annulation par l'utilisateur
call tests.as_key('a');
select public.cancel_generation((select v from ids where k='e1'));
select public.cancel_generation((select v from ids where k='e1'));  -- idempotent
select tests.ok((select status from public.episodes where id = (select v from ids where k='e1')) = 'cancelled', 'épisode annulé');
select tests.ok(tests.count($$select 1 from public.generation_steps where job_id = (select v from ids where k='j2') and status = 'pending'$$) = 0, 'étapes en attente annulées');
select tests.ok((select generations_used from public.quota_usage) = 0, 'annulation avant traitement : quota rendu');
call tests.as_service();
select tests.ok(tests.count($$select * from public.claim_step('w1', array['intent']::public.step_type[])$$) = 0, 'aucune étape d''une tâche annulée n''est réclamée');

-- Quota mensuel épuisé
call tests.as_owner();
update public.quota_usage set generations_used = 3;
call tests.as_key('a');
select tests.throws($$select public.request_generation((select v from ids where k='e2'), 'idem-key-0005')$$, 'quota mensuel épuisé', 'quota_exceeded');
call tests.as_owner();
rollback;
