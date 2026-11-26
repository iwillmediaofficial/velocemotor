-- Veloce Motor — initial schema
-- Public site is static: anon may only READ active catalogue data.
-- Public WRITES (bookings, enquiries) go through the Cloudflare Function using the service role.
-- Admins are users whose JWT carries app_metadata.role = 'admin' (set only via service role / SQL).

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------
create table public.segments (
  id    text primary key check (id ~ '^[a-z0-9-]+$'),
  name  text not null,
  blurb text not null default '',
  sort  int  not null default 0
);

create table public.vehicles (
  id         text primary key check (id ~ '^[a-z0-9-]+$'),
  brand      text not null,
  model      text not null,
  segment_id text references public.segments(id) on update cascade on delete set null,
  sort       int  not null default 0,
  unique (brand, model)
);
create index vehicles_segment_idx on public.vehicles(segment_id);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 2 and 120),
  segment_id  text not null references public.segments(id) on update cascade,
  position    text check (position in ('Front', 'Rear', 'Rear pair', 'Front & rear')),
  short_desc  text not null default '',
  description text not null default '',
  specs       jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),   -- [{label, value}]
  price       numeric(10,2) not null check (price >= 0),
  mrp         numeric(10,2) not null,
  sku         text,
  images      jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),  -- [{id, w, h, alt}]
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint products_mrp_gte_price check (mrp >= price)
);
create index products_segment_active_idx on public.products(segment_id, is_active);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_fitment (
  product_id uuid not null references public.products(id) on delete cascade,
  vehicle_id text not null references public.vehicles(id) on update cascade on delete cascade,
  primary key (product_id, vehicle_id)
);
create index product_fitment_vehicle_idx on public.product_fitment(vehicle_id);

create table public.services (
  id           text primary key check (id ~ '^[a-z0-9-]+$'),
  name         text not null,
  description  text not null default '',
  price_from   numeric(10,2) not null check (price_from >= 0),
  duration_min int not null check (duration_min > 0),
  is_bookable  boolean not null default true,
  is_active    boolean not null default true,
  sort         int not null default 0
);

-- ---------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------
create table public.settings (
  id                 int primary key default 1 check (id = 1),
  phone              text not null default '',
  whatsapp           text not null default '' check (whatsapp ~ '^[0-9]*$'),
  email              text not null default '',
  address            text not null default '',
  hours              text not null default '',
  slots              text[] not null default '{10:00,12:00,14:00,16:00}',
  slot_capacity      int  not null default 2 check (slot_capacity between 1 and 50),
  closed_days        int[] not null default '{0}',          -- 0 = Sunday … 6 = Saturday
  holidays           date[] not null default '{}',
  booking_days       int  not null default 21 check (booking_days between 1 and 90),
  min_lead_minutes   int  not null default 60 check (min_lead_minutes >= 0),
  content_updated_at timestamptz not null default now(),   -- last catalogue/content change
  last_publish_at    timestamptz,                          -- last site rebuild trigger
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Bookings & enquiries
-- ---------------------------------------------------------------
create sequence public.booking_ref_seq;

create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique,
  service_id   text not null references public.services(id) on update cascade,
  product_id   uuid references public.products(id) on delete set null,
  name         text not null check (char_length(name) between 2 and 100),
  phone        text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email        text check (email is null or char_length(email) <= 254),
  vehicle      text not null check (char_length(vehicle) between 2 and 120),
  booking_date date not null,
  slot         text not null,
  notes        text check (notes is null or char_length(notes) <= 1000),
  status       text not null default 'pending'
               check (status in ('pending', 'confirmed', 'rescheduled', 'completed', 'cancelled')),
  admin_note   text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index bookings_slot_idx    on public.bookings(booking_date, slot) where status <> 'cancelled';
create index bookings_status_idx  on public.bookings(status, booking_date);
create index bookings_created_idx on public.bookings(created_at desc);
create index bookings_product_idx on public.bookings(product_id);
create index bookings_service_idx on public.bookings(service_id);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 100),
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email      text check (email is null or char_length(email) <= 254),
  product_id uuid references public.products(id) on delete set null,
  message    text not null check (char_length(message) between 10 and 2000),
  status     text not null default 'new' check (status in ('new', 'replied', 'closed')),
  created_at timestamptz not null default now()
);
create index enquiries_created_idx on public.enquiries(created_at desc);
create index enquiries_status_idx  on public.enquiries(status);
create index enquiries_product_idx on public.enquiries(product_id);

-- ---------------------------------------------------------------
-- "Unpublished changes" tracking: any catalogue change bumps settings.content_updated_at
-- ---------------------------------------------------------------
create or replace function public.touch_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.settings set content_updated_at = now() where id = 1;
  return null;
end;
$$;
revoke execute on function public.touch_content() from public, anon, authenticated;

create trigger segments_touch after insert or update or delete on public.segments
  for each statement execute function public.touch_content();
create trigger vehicles_touch after insert or update or delete on public.vehicles
  for each statement execute function public.touch_content();
create trigger products_touch after insert or update or delete on public.products
  for each statement execute function public.touch_content();
create trigger fitment_touch after insert or update or delete on public.product_fitment
  for each statement execute function public.touch_content();
create trigger services_touch after insert or update or delete on public.services
  for each statement execute function public.touch_content();

create or replace function public.settings_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- contact details are baked into the static site; slot rules are read live
  if (new.phone, new.whatsapp, new.email, new.address, new.hours)
     is distinct from (old.phone, old.whatsapp, old.email, old.address, old.hours) then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;
create trigger settings_before_update before update on public.settings
  for each row execute function public.settings_before_update();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table public.segments        enable row level security;
alter table public.vehicles        enable row level security;
alter table public.products        enable row level security;
alter table public.product_fitment enable row level security;
alter table public.services        enable row level security;
alter table public.settings        enable row level security;
alter table public.bookings        enable row level security;
alter table public.enquiries       enable row level security;

-- public read
create policy "segments read"  on public.segments        for select to anon, authenticated using (true);
create policy "vehicles read"  on public.vehicles        for select to anon, authenticated using (true);
create policy "fitment read"   on public.product_fitment for select to anon, authenticated using (true);
create policy "settings read"  on public.settings        for select to anon, authenticated using (true);
create policy "products read"  on public.products        for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "services read"  on public.services        for select to anon, authenticated
  using (is_active or (select public.is_admin()));

-- admin write (catalogue)
create policy "segments admin insert" on public.segments for insert to authenticated with check ((select public.is_admin()));
create policy "segments admin update" on public.segments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "segments admin delete" on public.segments for delete to authenticated using ((select public.is_admin()));

create policy "vehicles admin insert" on public.vehicles for insert to authenticated with check ((select public.is_admin()));
create policy "vehicles admin update" on public.vehicles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "vehicles admin delete" on public.vehicles for delete to authenticated using ((select public.is_admin()));

create policy "products admin insert" on public.products for insert to authenticated with check ((select public.is_admin()));
create policy "products admin update" on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "products admin delete" on public.products for delete to authenticated using ((select public.is_admin()));

create policy "fitment admin insert" on public.product_fitment for insert to authenticated with check ((select public.is_admin()));
create policy "fitment admin delete" on public.product_fitment for delete to authenticated using ((select public.is_admin()));

create policy "services admin insert" on public.services for insert to authenticated with check ((select public.is_admin()));
create policy "services admin update" on public.services for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "services admin delete" on public.services for delete to authenticated using ((select public.is_admin()));

create policy "settings admin update" on public.settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- bookings / enquiries: admin only (inserts come from the service role)
create policy "bookings admin read"   on public.bookings for select to authenticated using ((select public.is_admin()));
create policy "bookings admin update" on public.bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "bookings admin delete" on public.bookings for delete to authenticated using ((select public.is_admin()));

create policy "enquiries admin read"   on public.enquiries for select to authenticated using ((select public.is_admin()));
create policy "enquiries admin update" on public.enquiries for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "enquiries admin delete" on public.enquiries for delete to authenticated using ((select public.is_admin()));

-- explicit grants (RLS still applies)
grant select on public.segments, public.vehicles, public.products, public.product_fitment,
                public.services, public.settings to anon, authenticated;
grant insert, update, delete on public.segments, public.vehicles, public.products,
                public.services to authenticated;
grant insert, delete on public.product_fitment to authenticated;
grant update on public.settings to authenticated;
grant select, update, delete on public.bookings, public.enquiries to authenticated;
revoke insert on public.bookings, public.enquiries from anon, authenticated;
