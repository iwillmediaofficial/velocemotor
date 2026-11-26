-- Customers say what kind of vehicle they are bringing.
alter table public.bookings
  add column vehicle_type text check (vehicle_type in ('bike', 'scooter', 'ev', 'car'));

-- create_booking gains p_vehicle_type (new signature → drop and recreate)
drop function if exists public.create_booking(text, uuid, text, text, text, text, date, text, text);

create function public.create_booking(
  p_service      text,
  p_product      uuid,
  p_name         text,
  p_phone        text,
  p_email        text,
  p_vehicle      text,
  p_date         date,
  p_slot         text,
  p_notes        text,
  p_vehicle_type text
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
  if p_vehicle_type is null or p_vehicle_type not in ('bike', 'scooter', 'ev', 'car') then
    raise exception 'INVALID_VEHICLE_TYPE' using errcode = 'P0001';
  end if;
  if p_product is not null and not exists (select 1 from public.products where id = p_product and is_active) then
    p_product := null;
  end if;

  perform public._check_slot(p_date, p_slot, null, true);

  insert into public.bookings (ref, service_id, product_id, name, phone, email, vehicle_type, vehicle, booking_date, slot, notes)
  values (
    'VM-' || to_char(p_date, 'DDMM') || '-' || lpad(nextval('public.booking_ref_seq')::text, 4, '0'),
    p_service, p_product, trim(p_name), p_phone, nullif(trim(p_email), ''), p_vehicle_type, trim(p_vehicle),
    p_date, p_slot, nullif(trim(p_notes), '')
  )
  returning * into b;

  return b;
end;
$$;

revoke execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text, text) to service_role;
