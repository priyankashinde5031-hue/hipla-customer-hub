-- Freeze renewal dates that currently derive from the SITE banner go-live.
--
-- Why: we are about to remove the site-level banner go-live (sites.go_live_date)
-- and make Implementation the sole source of per-PO go-live. Renewal dates are
-- computed on read as:  manual override  →  the PO's implementation go-live  →
-- the site banner (fallback). Removing the banner would blank out any renewal
-- whose date is CURRENTLY coming from that fallback. This one-time backfill pins
-- those exact dates onto the rows (renewal_date_override) so nothing shifts.
--
-- Scope — we only touch rows that would otherwise change:
--   * skip rows that already have a manual override (a date typed by hand)   → safe
--   * skip rows whose PO has an implementation go-live (Stage 4 goLiveDate)  → stays
--       dynamic and correct; that is the source we keep
--   * for the rest, if a banner date exists, stamp  banner + offset_months
--       (the exact date the Site 360 shows today). Rows with no banner date at
--       all are left null and keep showing "—" (unchanged).
--
-- Which banner date: the renewal's anchor site (the site the PO was created on,
-- i.e. the Site 360 where that fallback date is actually displayed). For older
-- rows with no anchor site we fall back to the earliest go-live among the PO's
-- covered sites (matching the dashboards' convention).
--
-- Date math mirrors lib/renewals.ts addMonths(): Postgres `date + interval`
-- clamps a short target month to its last valid day (e.g. Jan 31 + 1mo → Feb 28).
--
-- Idempotent: only rows with a null override are touched, so a re-run is a no-op.
--
-- The work runs inside a DO block only so it can report, on screen, how many
-- renewal dates it froze — a plain-language confirmation for a non-technical
-- reviewer that the backfill did what was intended.

do $$
declare
  frozen_count integer;
begin
  update renewals r
  set
    renewal_date_override = (eff.banner_date + make_interval(months => r.offset_months))::date,
    updated_at = now()
  from (
    select
      r2.id,
      coalesce(anchor_s.go_live_date, covered.banner_date) as banner_date
    from renewals r2
    left join sites anchor_s
      on anchor_s.id = r2.anchor_site_id
    left join (
      -- earliest go-live among the sites a PO covers (fallback anchor)
      select ps.po_id, min(s.go_live_date) as banner_date
      from po_sites ps
      join sites s on s.id = ps.site_id
      where s.go_live_date is not null
      group by ps.po_id
    ) covered
      on covered.po_id = r2.po_id
    where r2.renewal_date_override is null
      -- no per-PO implementation go-live → this row was leaning on the banner
      and not exists (
        select 1
        from implementation_projects ip
        join implementation_project_stages st
          on st.project_id = ip.id and st.stage_number = 4
        where ip.po_id = r2.po_id
          and coalesce(st.data->>'goLiveDate', '') <> ''
      )
  ) eff
  where eff.id = r.id
    and eff.banner_date is not null;

  get diagnostics frozen_count = row_count;
  raise notice 'Freeze complete: pinned % renewal date(s) that were deriving from the site banner.', frozen_count;
end $$;
