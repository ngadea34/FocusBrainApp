-- Aides de test (jamais déployées).
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.create_user(p_email text) returns uuid
language sql as $$
  insert into auth.users (email) values (p_email) returning id
$$;

-- Bascule l'identité de la session courante, comme le ferait PostgREST.
create or replace procedure tests.as_user(p_uid uuid)
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace procedure tests.as_anon()
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  execute 'set role anon';
end $$;

create or replace procedure tests.as_service()
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  execute 'set role service_role';
end $$;

create or replace procedure tests.as_owner()
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

-- Assertions
create or replace function tests.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ÉCHEC: %', msg;
  end if;
  raise notice 'ok - %', msg;
end $$;

-- Vérifie qu'une instruction SQL échoue (optionnellement avec un fragment de message).
create or replace function tests.throws(sql text, msg text, expected text default null) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if expected is not null and position(expected in sqlerrm) = 0 then
      raise exception 'ÉCHEC: % (erreur inattendue: %)', msg, sqlerrm;
    end if;
    raise notice 'ok - %', msg;
    return;
  end;
  raise exception 'ÉCHEC: % (aucune erreur levée)', msg;
end $$;

create or replace function tests.count(sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || sql || ') q' into n;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
grant execute on all procedures in schema tests to anon, authenticated, service_role;

-- Variante par clé : lit l'identifiant dans la table temporaire « ids » du test.
create or replace procedure tests.as_key(p_key text)
language plpgsql as $$
declare u uuid;
begin
  execute 'reset role';
  execute 'select v from ids where k = $1' into u using p_key;
  call tests.as_user(u);
end $$;
grant execute on procedure tests.as_key(text) to anon, authenticated, service_role;
