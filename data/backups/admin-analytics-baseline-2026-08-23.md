# Admin analytics baseline backup

Created: 2026-08-23T15:35:00Z
Scope: Cowinmagnet South Africa admin analytics upgrade.

## Protected existing records
- data/cms/analytics-events.json
- data/cms/enquiries.json
- data/cms/audit-logs.json
- africa_json_documents PostgreSQL records, when DATABASE_URL is configured

## Original implementation
- Public page views are sent by assets/site.js to POST /api/track.
- The API wrote a capped JSON event array through the generic CMS document store.
- Existing events are retained. The upgrade imports them into a dedicated analytics table with idempotent inserts and never deletes the source document.

## Rollback
1. Disable analytics collection with ANALYTICS_COLLECTION_ENABLED=false.
2. Continue reading the preserved generic analytics document.
3. Dedicated analytics tables are additive and can be ignored without affecting products, enquiries, News, SEO, or public pages.

No live database export is stored in the repository because it can contain visitor and enquiry data. The production migration creates an in-database backup document before importing historical events.
