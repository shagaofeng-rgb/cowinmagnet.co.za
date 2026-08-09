# UI/UX Rebuild Baseline

- Captured: 2026-08-09 (Asia/Shanghai)
- Baseline Git commit: `9ff80a3f Improve product discovery navigation and imagery`
- Production URL checked: `https://cowinmagnet.co.za/en-za/`
- Before screenshot: `screenshots/before-production-home-1440.png`

## Confirmed before work

| Area | Observation |
| --- | --- |
| Canonical locale path | `/en-za/` returned `200`. |
| Non-canonical locale path | `/en-za` returned a self-referential `308 Location: /en-za`, causing a redirect loop in production. |
| Navigation | Static navigation mixed old groups; the runtime menu hid direct access to several important groups. |
| Product discovery | The catalogue rendered all records as a single long collection after introductory cards. |
| Product mobile specs | Desktop table minimum-width remained within the mobile layout. |

## Preservation and rollback

No database records, product data files, existing product URLs, enquiry endpoints, analytics code, or CMS records were deleted. Existing history at `9ff80a3f` is the source-level rollback point. To roll back this change after deployment, revert the deployment commit and redeploy; static HTML is regenerated from the versioned render scripts.

