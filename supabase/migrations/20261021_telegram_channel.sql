begin;

create table public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  telegram_user_id text not null unique,
  chat_id text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.telegram_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  telegram_user_id text,
  chat_id text,
  display_name text
);

create table public.telegram_events (
  update_id bigint primary key,
  link_id uuid not null references public.telegram_links(id) on delete cascade,
  job_id uuid not null unique default gen_random_uuid(),
  question text not null,
  reply text,
  status text not null default 'processing' check (status in ('processing', 'ready', 'sent')),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index telegram_events_link_created on public.telegram_events(link_id, created_at desc);

create table public.telegram_update_receipts (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);
create index telegram_update_receipts_received on public.telegram_update_receipts(received_at);

alter table public.telegram_links enable row level security;
alter table public.telegram_link_requests enable row level security;
alter table public.telegram_events enable row level security;
alter table public.telegram_update_receipts enable row level security;
revoke all on public.telegram_links, public.telegram_link_requests, public.telegram_events, public.telegram_update_receipts from anon, authenticated;
grant all on public.telegram_links, public.telegram_link_requests, public.telegram_events, public.telegram_update_receipts to service_role;

create function public.telegram_start_link(p_user uuid, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if exists(select 1 from public.telegram_links where user_id = p_user) then
    raise exception 'Already linked';
  end if;
  delete from public.telegram_link_requests where user_id = p_user or expires_at < now();
  insert into public.telegram_link_requests(user_id, token_hash, expires_at)
    values(p_user, p_hash, now() + interval '10 minutes') returning id into request_id;
  return request_id;
end;
$$;

create function public.telegram_propose_link(p_hash text, p_actor text, p_chat text, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.telegram_link_requests set telegram_user_id = p_actor, chat_id = p_chat, display_name = left(p_name, 80)
    where token_hash = p_hash and expires_at > now()
      and (telegram_user_id is null or (telegram_user_id = p_actor and chat_id = p_chat));
  return found;
end;
$$;

create function public.telegram_confirm_link(p_user uuid, p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare candidate public.telegram_link_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into candidate from public.telegram_link_requests
    where id = p_request and user_id = p_user and expires_at > now() for update;
  if not found or candidate.telegram_user_id is null then
    raise exception 'Link request expired or unclaimed';
  end if;
  insert into public.telegram_links(user_id, telegram_user_id, chat_id, display_name)
    values(p_user, candidate.telegram_user_id, candidate.chat_id, candidate.display_name);
  delete from public.telegram_link_requests where user_id = p_user;
end;
$$;

create function public.telegram_unlink(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  delete from public.telegram_link_requests where user_id = p_user;
  delete from public.telegram_links where user_id = p_user;
end;
$$;

create function public.telegram_claim_event(p_update bigint, p_actor text, p_chat text, p_question text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare linked public.telegram_links; event public.telegram_events; token uuid;
begin
  select * into linked from public.telegram_links
    where telegram_user_id = p_actor and chat_id = p_chat for update;
  if not found then return jsonb_build_object('state', 'unlinked'); end if;
  delete from public.telegram_events where link_id = linked.id and created_at < now() - interval '1 day';
  select * into event from public.telegram_events where update_id = p_update for update;
  if found then
    if event.link_id <> linked.id or event.status = 'sent' then
      return jsonb_build_object('state', 'done');
    end if;
    if event.lease_until > now() then return jsonb_build_object('state', 'busy'); end if;
    if event.attempts >= 5 then return jsonb_build_object('state', 'exhausted'); end if;
  else
    if (select count(*) from public.telegram_events where link_id = linked.id and created_at > now() - interval '1 minute') >= 10 then
      return jsonb_build_object('state', 'busy');
    end if;
  end if;
  if exists(select 1 from public.telegram_events where link_id = linked.id and update_id <> p_update and lease_until > now()) then
    return jsonb_build_object('state', 'busy');
  end if;
  if event.update_id is null then
    delete from public.telegram_update_receipts where received_at < now() - interval '7 days';
    insert into public.telegram_update_receipts(update_id) values(p_update) on conflict(update_id) do nothing;
    if not found then return jsonb_build_object('state', 'done'); end if;
  end if;
  insert into public.telegram_events(update_id, link_id, question)
    values(p_update, linked.id, left(p_question, 2000)) on conflict(update_id) do nothing;
  token := gen_random_uuid();
  update public.telegram_events set lease_id = token, lease_until = now() + interval '270 seconds', attempts = attempts + 1
    where update_id = p_update returning * into event;
  return to_jsonb(event) || jsonb_build_object('state', 'claimed', 'user_id', linked.user_id, 'chat_id', linked.chat_id);
end;
$$;

revoke all on function public.telegram_start_link(uuid, text) from public, anon, authenticated;
revoke all on function public.telegram_propose_link(text, text, text, text) from public, anon, authenticated;
revoke all on function public.telegram_confirm_link(uuid, uuid) from public, anon, authenticated;
revoke all on function public.telegram_unlink(uuid) from public, anon, authenticated;
revoke all on function public.telegram_claim_event(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_start_link(uuid, text), public.telegram_propose_link(text, text, text, text),
  public.telegram_confirm_link(uuid, uuid), public.telegram_unlink(uuid), public.telegram_claim_event(bigint, text, text, text) to service_role;

commit;
