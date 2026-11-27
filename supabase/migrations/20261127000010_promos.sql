-- Home page slider: new launches and offers, managed in Admin → Offers & Launches.
-- Read once per build (static site), so visitors never query this table.
create table public.promos (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'offer' check (kind in ('launch', 'offer', 'limited')),
  title          text not null check (char_length(title) between 2 and 80),
  subtitle       text not null default '' check (char_length(subtitle) <= 220),
  highlight      text not null default '' check (char_length(highlight) <= 40),  -- e.g. "₹299" or "20% OFF"
  cta_label      text not null default 'Learn more' check (char_length(cta_label) between 1 and 30),
  cta_url        text not null default '/book' check (cta_url ~ '^(/[^/\\]|/$|https://)'),
  image          jsonb check (image is null or jsonb_typeof(image) = 'object'),         -- {id, w, h, alt}
  image_mobile   jsonb check (image_mobile is null or jsonb_typeof(image_mobile) = 'object'),
  image_has_text boolean not null default false,  -- finished banner: the site adds no text on top
  starts_on      date,
  ends_on        date,
  is_active      boolean not null default true,
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint promos_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint promos_banner_needs_image check (not image_has_text or image is not null)
);
create trigger promos_updated_at before update on public.promos
  for each row execute function public.set_updated_at();
create trigger promos_touch after insert or update or delete on public.promos
  for each statement execute function public.touch_content();

alter table public.promos enable row level security;
create policy "promos read" on public.promos for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "promos admin insert" on public.promos for insert to authenticated with check ((select public.is_admin()));
create policy "promos admin update" on public.promos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "promos admin delete" on public.promos for delete to authenticated using ((select public.is_admin()));

grant select on public.promos to anon, authenticated;
grant insert, update, delete on public.promos to authenticated;
grant select, insert, update, delete on public.promos to service_role;
