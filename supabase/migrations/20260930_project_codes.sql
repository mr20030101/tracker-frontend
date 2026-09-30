-- Gives each project the code the CTS Tracker form lists it under (its "Tracking Project"
-- option), so the CTS modal can preselect it. Seeds the codes for the projects we know of.

alter table public.projects add column if not exists code text;

update public.projects set code = 'aloha_data_collection_v1' where code is null and name ilike 'aloha%';
update public.projects set code = 'ursa_majoris' where code is null and name ilike 'ursa%';
update public.projects set code = 'sweet_yam' where code is null and name ilike 'sweet ya%';
