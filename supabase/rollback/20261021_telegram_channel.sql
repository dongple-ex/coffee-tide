begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  dry_run boolean := coalesce(current_setting('coffeetide.telegram_rollback_apply', true), 'false') <> 'true';
  name text;
  has_rows boolean;
begin
  foreach name in array array['telegram_links','telegram_link_requests','telegram_events','telegram_update_receipts'] loop
    if to_regclass('public.' || name) is not null then
      if not dry_run then
        execute format('lock table public.%I in access exclusive mode', name);
      end if;
      execute format('select exists(select 1 from public.%I limit 1)', name) into has_rows;
      if has_rows then
        raise exception 'Telegram rollback refused: table % contains data. Stop the webhook and preserve the schema.', name;
      end if;
    end if;
  end loop;
  if dry_run then
    raise notice 'DRY_RUN=true. Empty Telegram tables checked; no schema changes made.';
    return;
  end if;
  drop function if exists public.telegram_claim_event(bigint, text, text, text);
  drop function if exists public.telegram_confirm_link(uuid, uuid);
  drop function if exists public.telegram_propose_link(text, text, text, text);
  drop function if exists public.telegram_start_link(uuid, text);
  drop function if exists public.telegram_unlink(uuid);
  drop table if exists public.telegram_events;
  drop table if exists public.telegram_link_requests;
  drop table if exists public.telegram_links;
  drop table if exists public.telegram_update_receipts;
end;
$$;

commit;
