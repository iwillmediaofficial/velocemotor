-- Pricing per vehicle type.
-- • service_prices holds one row per (service, vehicle type) that the service is offered for:
--   its price and duration. No row = the service is not offered for that vehicle type.
-- • bookings.quoted_price stores the price shown to the customer when they booked (a snapshot,
--   so later price changes never alter existing bookings).
-- • services.price_from / duration_min are replaced by this table.

create table public.service_prices (
  service_id   text not null references public.services(id) on update cascade on delete cascade,
  vehicle_type text not null check (vehicle_type in ('bike', 'scooter', 'ev', 'car')),
  price        numeric(10,2) not null check (price >= 0),
  duration_min int not null check (duration_min > 0),
  primary key (service_id, vehicle_type)
);

alter table public.service_prices enable row level security;
create policy "service_prices read" on public.service_prices for select to anon, authenticated using (true);
create policy "service_prices admin insert" on public.service_prices for insert to authenticated with check ((select public.is_admin()));
create policy "service_prices admin update" on public.service_prices for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "service_prices admin delete" on public.service_prices for delete to authenticated using ((select public.is_admin()));
grant select on public.service_prices to anon, authenticated;
grant insert, update, delete on public.service_prices to authenticated;
grant select, insert, update, delete on public.service_prices to service_role;

create trigger service_prices_touch after insert or update or delete on public.service_prices
  for each statement execute function public.touch_content();

-- Seed from the current single price: every service is offered for two-wheelers at its current price.
-- Washing is also offered for cars (placeholder price — set the real one in admin).
insert into public.service_prices (service_id, vehicle_type, price, duration_min)
select s.id, t.vt, s.price_from, s.duration_min
from public.services s cross join (values ('bike'), ('scooter'), ('ev')) as t(vt);

insert into public.service_prices (service_id, vehicle_type, price, duration_min)
select id, 'car', 599, 90 from public.services where id = 'washing';

alter table public.services drop column price_from;
alter table public.services drop column duration_min;

-- Price snapshot on bookings
alter table public.bookings add column quoted_price numeric(10,2);

-- create_booking: the service must be offered for the vehicle type; store the quoted price.
create or replace function public.create_booking(
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
  v_price numeric(10,2);
begin
  if not exists (select 1 from public.services where id = p_service and is_active and is_bookable) then
    raise exception 'INVALID_SERVICE' using errcode = 'P0001';
  end if;
  if p_vehicle_type is null or p_vehicle_type not in ('bike', 'scooter', 'ev', 'car') then
    raise exception 'INVALID_VEHICLE_TYPE' using errcode = 'P0001';
  end if;
  select price into v_price from public.service_prices where service_id = p_service and vehicle_type = p_vehicle_type;
  if not found then
    raise exception 'SERVICE_NOT_FOR_VEHICLE' using errcode = 'P0001';
  end if;
  if p_product is not null and not exists (select 1 from public.products where id = p_product and is_active) then
    p_product := null;
  end if;

  perform public._check_slot(p_date, p_slot, null, true);

  insert into public.bookings (ref, service_id, product_id, name, phone, email, vehicle_type, vehicle, booking_date, slot, notes, quoted_price)
  values (
    'VM-' || to_char(p_date, 'DDMM') || '-' || lpad(nextval('public.booking_ref_seq')::text, 4, '0'),
    p_service, p_product, trim(p_name), p_phone, nullif(trim(p_email), ''), p_vehicle_type, trim(p_vehicle),
    p_date, p_slot, nullif(trim(p_notes), ''), v_price
  )
  returning * into b;

  return b;
end;
$$;

revoke execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(text, uuid, text, text, text, text, date, text, text, text) to service_role;
