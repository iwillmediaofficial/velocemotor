-- Admin-created bookings (phone / walk-in / WhatsApp) use the same slots and capacity as online bookings.

alter table public.bookings
  add column source text not null default 'online' check (source in ('online', 'phone', 'walk_in', 'whatsapp'));

create or replace function public.admin_create_booking(
  p_service      text,
  p_vehicle_type text,
  p_vehicle      text,
  p_name         text,
  p_phone        text,
  p_email        text,
  p_date         date,
  p_slot         text,
  p_notes        text,
  p_admin_note   text,
  p_status       text,     -- 'confirmed' (blocks the slot) or 'pending'
  p_price        numeric,  -- null = use the price list
  p_source       text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settings;
  b public.bookings;
  v_price numeric(10,2);
  used int;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_status not in ('confirmed', 'pending') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if p_source not in ('phone', 'walk_in', 'whatsapp', 'online') then
    raise exception 'INVALID_SOURCE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.services where id = p_service) then
    raise exception 'INVALID_SERVICE' using errcode = 'P0001';
  end if;
  select price into v_price from public.service_prices where service_id = p_service and vehicle_type = p_vehicle_type;
  if not found then
    raise exception 'SERVICE_NOT_FOR_VEHICLE' using errcode = 'P0001';
  end if;

  select * into s from public.settings where id = 1;
  if not (p_slot = any (s.slots)) then
    raise exception 'INVALID_SLOT' using errcode = 'P0001';
  end if;
  -- Admins may book any future date (no online booking-window limit) and later today (walk-ins),
  -- but not in the past or on a closed day.
  if p_date < today then
    raise exception 'DATE_IN_PAST' using errcode = 'P0001';
  end if;
  if extract(dow from p_date)::int = any (s.closed_days) or p_date = any (s.holidays) then
    raise exception 'CLOSED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('slot:' || p_date::text || ' ' || p_slot));
  if p_status = 'confirmed' then
    select count(*) into used from public.bookings
    where booking_date = p_date and slot = p_slot and public.is_blocking_status(status);
    if used >= s.slot_capacity then
      raise exception 'SLOT_FULL' using errcode = 'P0001';
    end if;
  end if;

  insert into public.bookings (ref, service_id, name, phone, email, vehicle_type, vehicle, booking_date, slot,
                               notes, admin_note, status, quoted_price, source)
  values (
    'VM-' || to_char(p_date, 'DDMM') || '-' || lpad(nextval('public.booking_ref_seq')::text, 4, '0'),
    p_service, trim(p_name), p_phone, nullif(trim(p_email), ''), p_vehicle_type, trim(p_vehicle), p_date, p_slot,
    nullif(trim(p_notes), ''), nullif(trim(p_admin_note), ''), p_status, coalesce(p_price, v_price), p_source
  )
  returning * into b;
  return b;
end;
$$;

revoke execute on function public.admin_create_booking(text, text, text, text, text, text, date, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_create_booking(text, text, text, text, text, text, date, text, text, text, text, numeric, text) to service_role;
