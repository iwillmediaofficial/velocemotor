-- Bookings are REQUESTS until an admin confirms them.
-- • Only confirmed / rescheduled / completed bookings occupy a slot ("blocking" statuses).
-- • Pending requests never block: several customers can request the same slot; the admin sees them
--   first-come-first-served (by created_at) and confirms one. Confirming re-checks capacity under a lock.

create or replace function public.is_blocking_status(s text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select s in ('confirmed', 'rescheduled', 'completed') $$;

-- Capacity check now counts only blocking bookings.
create or replace function public._check_slot(p_date date, p_slot text, p_ignore uuid, p_enforce_lead boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settings;
  used int;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into s from public.settings where id = 1;

  if not (p_slot = any (s.slots)) then
    raise exception 'INVALID_SLOT' using errcode = 'P0001';
  end if;
  if p_date < today or p_date > today + (s.booking_days - 1) then
    raise exception 'DATE_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  if extract(dow from p_date)::int = any (s.closed_days) or p_date = any (s.holidays) then
    raise exception 'CLOSED' using errcode = 'P0001';
  end if;
  if p_enforce_lead and ((p_date + p_slot::time) at time zone 'Asia/Kolkata') < now() + make_interval(mins => s.min_lead_minutes) then
    raise exception 'TOO_LATE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('slot:' || p_date::text || ' ' || p_slot));

  select count(*) into used
  from public.bookings
  where booking_date = p_date and slot = p_slot
    and public.is_blocking_status(status)
    and (p_ignore is null or id <> p_ignore);

  if used >= s.slot_capacity then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;
end;
$$;

-- Public calendar: a slot is "full" only when confirmed bookings reach capacity.
create or replace function public.slot_availability()
returns table (day date, slot text, remaining int, available boolean, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.settings where id = 1),
  days as (
    select ((now() at time zone 'Asia/Kolkata')::date + g)::date as day
    from s, generate_series(0, s.booking_days - 1) g
  ),
  grid as (
    select d.day, sl.slot
    from days d cross join s cross join lateral unnest(s.slots) as sl(slot)
  ),
  used as (
    select b.booking_date, b.slot, count(*)::int as n
    from public.bookings b
    where public.is_blocking_status(b.status)
      and b.booking_date >= (now() at time zone 'Asia/Kolkata')::date
    group by 1, 2
  )
  select
    g.day,
    g.slot,
    greatest(s.slot_capacity - coalesce(u.n, 0), 0) as remaining,
    case
      when extract(dow from g.day)::int = any (s.closed_days) or g.day = any (s.holidays) then false
      when ((g.day + g.slot::time) at time zone 'Asia/Kolkata') < now() + make_interval(mins => s.min_lead_minutes) then false
      when coalesce(u.n, 0) >= s.slot_capacity then false
      else true
    end as available,
    case
      when extract(dow from g.day)::int = any (s.closed_days) or g.day = any (s.holidays) then 'closed'
      when ((g.day + g.slot::time) at time zone 'Asia/Kolkata') < now() + make_interval(mins => s.min_lead_minutes) then 'past'
      when coalesce(u.n, 0) >= s.slot_capacity then 'full'
      else null
    end as reason
  from grid g
  cross join s
  left join used u on u.booking_date = g.day and u.slot = g.slot
  order by g.day, g.slot
$$;

-- Admin update: confirming (or moving a confirmed booking) checks capacity; pending changes never block.
create or replace function public.admin_update_booking(
  p_id     uuid,
  p_status text default null,
  p_note   text default null,
  p_date   date default null,
  p_slot   text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  new_date date;
  new_slot text;
  new_status text;
  moving boolean;
begin
  select * into b from public.bookings where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  new_date := coalesce(p_date, b.booking_date);
  new_slot := coalesce(p_slot, b.slot);
  moving := new_date <> b.booking_date or new_slot <> b.slot;
  -- an admin moving a booking to a new time is effectively confirming that new time
  new_status := coalesce(p_status, case when moving then 'rescheduled' else b.status end);

  if public.is_blocking_status(new_status)
     and new_status <> 'completed'
     and (moving or not public.is_blocking_status(b.status)) then
    perform public._check_slot(new_date, new_slot, b.id, false);
  end if;

  update public.bookings
  set status = new_status, admin_note = coalesce(p_note, admin_note), booking_date = new_date, slot = new_slot
  where id = p_id
  returning * into b;

  return b;
end;
$$;

-- Only confirmed bookings need the slot index now
drop index if exists public.bookings_slot_idx;
create index bookings_slot_idx on public.bookings(booking_date, slot, created_at);

revoke execute on function public.is_blocking_status(text) from public, anon, authenticated;
grant execute on function public.is_blocking_status(text) to service_role;
