-- Let internal_teams be managed by the generic Settings catalog editor.
--
-- The shared catalog inserter (settings/catalogs/actions.ts) only writes the
-- columns declared as `fields` — for teams that's just `name`. But
-- internal_teams.slug is NOT NULL, so a plain "name-only" insert would fail.
-- Auto-derive slug from name (a BEFORE trigger runs before the NOT NULL check),
-- so adding a team from Settings needs nothing but a name. Existing rows keep
-- their seeded slugs — the trigger only fills a blank one.

create or replace function set_internal_team_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'));
    -- Fallback so slug is never empty (e.g. a name with no alphanumerics).
    if new.slug = '' then
      new.slug := 'team-' || substr(gen_random_uuid()::text, 1, 8);
    end if;
  end if;
  return new;
end;
$$;

create trigger internal_teams_set_slug
  before insert or update on internal_teams
  for each row execute function set_internal_team_slug();
