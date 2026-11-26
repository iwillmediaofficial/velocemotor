-- Per-product switch for the "Book Fitting" button on the product page.
alter table public.products add column show_fitting boolean not null default true;
-- Care products (shampoo etc.) never need fitting.
update public.products set show_fitting = false where segment_id = 'care';
