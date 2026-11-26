-- Booking functions. All run as SECURITY DEFINER and are callable only by the service role
-- (the Cloudflare Function), except slot_availability which is read-only.
-- All dates/times are in India Standard Time.

-- ---------------------------------------------------------------
-- Availability for the booking calendar: one call returns every slot in the booking window
-- ---------------------------------------------------------------
create or replace function public.slot_availability()
returns table (day date, slot text, remaining int, available boolean, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.settings where id = 1),
  days as (
    select (
      (now() at time zone 'Asia/Kolkata')::date + g
    )::date as day
    from s, generate_series(0, s.booking_days - 1) g
  ),
  grid as (
    select d.day, sl.slot
    from days d cross join s cross join lateral unnest(s.slots) as sl(slot)
  ),
  used as (
    select b.booking_date, b.slot, count(*)::int as n
    from public.bookings b
    where b.status <> 'cancelled'
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

-- ---------------------------------------------------------------
-- Internal: validate a (date, slot) against settings and lock it. Raises on failure.
-- ---------------------------------------------------------------
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

  -- serialise concurrent bookings for the same slot
  perform pg_advisory_xact_lock(hashtext('slot:' || p_date::text || ' ' || p_slot));

  select count(*) into used
  from public.bookings
  where booking_date = p_date and slot = p_slot and status <> 'cancelled'
    and (p_ignore is null or id <> p_ignore);

  if used >= s.slot_capacity then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- Create a booking (public form, via service role)
-- ---------------------------------------------------------------
create or replace function public.create_booking(
  p_service text,
  p_product uuid,
  p_name    text,
  p_phone   text,
  p_email   text,
  p_vehicle text,
  p_date    date,
  p_slot    text,
  p_notes   text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  if not exists (select 1 from public.services where id = p_service and is_active and is_bookable) then
    raise exception 'INVALID_SERVICE' using errcode = 'P0001';
  end if;
  if p_product is not null and not exists (select 1 from public.products where id = p_product and is_active) then
    p_product := null;
  end if;

  perform public._check_slot(p_date, p_slot, null, true);

  insert into public.bookings (ref, service_id, product_id, name, phone, email, vehicle, booking_date, slot, notes)
  values (
    'VM-' || to_char(p_date, 'DDMM') || '-' || lpad(nextval('public.booking_ref_seq')::text, 4, '0'),
    p_service, p_product, trim(p_name), p_phone, nullif(trim(p_email), ''), trim(p_vehicle),
    p_date, p_slot, nullif(trim(p_notes), '')
  )
  returning * into b;

  return b;
end;
$$;

-- ---------------------------------------------------------------
-- Admin update (status / note / reschedule), via service role after the Function checks the admin JWT
-- ---------------------------------------------------------------
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
begin
  select * into b from public.bookings where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if (p_date is not null and p_date <> b.booking_date) or (p_slot is not null and p_slot <> b.slot) then
    perform public._check_slot(coalesce(p_date, b.booking_date), coalesce(p_slot, b.slot), b.id, false);
    b.booking_date := coalesce(p_date, b.booking_date);
    b.slot := coalesce(p_slot, b.slot);
    if p_status is null then
      p_status := 'rescheduled';
    end if;
  end if;

  update public.bookings
  set status       = coalesce(p_status, status),
      admin_note   = coalesce(p_note, admin_note),
      booking_date = b.booking_date,
      slot         = b.slot
  where id = p_id
  returning * into b;

  return b;
end;
$$;

-- ---------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------
revoke execute on function public.slot_availability()                                   from public, anon, authenticated;
revoke execute on function public._check_slot(date, text, uuid, boolean)                from public, anon, authenticated;
revoke execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_booking(uuid, text, text, date, text)    from public, anon, authenticated;

grant execute on function public.slot_availability()                                   to service_role;
grant execute on function public._check_slot(date, text, uuid, boolean)                to service_role;
grant execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text) to service_role;
grant execute on function public.admin_update_booking(uuid, text, text, date, text)    to service_role;
grant usage on sequence public.booking_ref_seq to service_role;
