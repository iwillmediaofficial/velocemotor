-- This project does not auto-grant table privileges to service_role on new tables,
-- so grant them explicitly. service_role is used only by the Cloudflare Functions (server-side secret).
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- and for tables/sequences created by future migrations
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
