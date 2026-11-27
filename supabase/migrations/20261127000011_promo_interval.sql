-- How long each home page slide stays before the slider moves on (Admin → Offers & Launches).
alter table public.settings
  add column promo_interval_sec smallint not null default 6 check (promo_interval_sec between 3 and 30);

-- The interval is baked into the static home page, so changing it must trigger a rebuild.
create or replace function public.settings_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- contact details and the slider timing are baked into the static site; slot rules are read live
  if (new.phone, new.whatsapp, new.email, new.address, new.hours, new.promo_interval_sec)
     is distinct from (old.phone, old.whatsapp, old.email, old.address, old.hours, old.promo_interval_sec) then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;
