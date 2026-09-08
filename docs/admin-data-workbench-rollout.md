# Admin data workbench rollout

Date: 2026-09-08
Scope: Cowinmagnet Africa administration only.

## Backup and rollback
- Baseline commit: `6dfdcb7c054a08686b83c32932f7ae6c9231c8ff`
- Backup branch: `backup/admin-data-workbench-20260908`
- Rollback: move `main` to the baseline commit or redeploy the matching Vercel deployment. No data rows are deleted by this rollout.

## Delivered
- Common server-side list contract: page sizes 20, 50, 100; keyword/status filtering; Today, This week, This month, Custom, and All time date ranges.
- Filter-aware exports for products, categories, enquiries, audit logs, and the corresponding data views.
- Visitor journey data now returns session groups and a paginated event history.
- A submitted enquiry records the existing first-party analytics visitor and session IDs. The admin visitor detail only joins enquiries with the same first-party visitor ID; IP addresses are never used to merge people.
- Visitor detail shows first/last visit, masked IP, device, sessions, linked real enquiries, conversion events, and the existing lead classification controls.
- Admin tables retain fixed page length and gain a direct page jump control.
- Analytics presets use Africa/Johannesburg. Test, crawler, preview, collect, and configured internal traffic remain excluded from business reports by default.

## Explicitly unchanged
- News publishing, news workflows, cron configuration, and News automation logic.
- Existing website content and historic analytics/event records.

## Verification required after deployment
1. Verify the production build.
2. Verify authenticated admin lists with date filters and 20/50/100 page sizes.
3. Verify visitor journey response on an existing tracked visitor.
4. Verify that a new real enquiry includes its first-party analytics visitor ID and appears only under that same visitor.
