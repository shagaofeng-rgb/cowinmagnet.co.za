# Cowinmagnet ZA News automation audit

Audit time: 2026-08-20T07:00:00Z  
Site: https://cowinmagnet.co.za  
Locale: en-ZA  
Timezone: Africa/Johannesburg

## Confirmed baseline

- The public News list is available at `/en-za/news/` and showed three published News records during the audit.
- The latest confirmed article in the repository was published on 2026-08-14.
- The existing task ran ingestion and publication checks together every 12 hours. Some commits were created for ingestion logs only, but were labelled as publication commits.
- The candidate pool had only one unused source domain, while the quality gate requires two independent source domains. This is the direct cause of the failed publication runs.
- Vercel production deployments for the changes made in this remediation are READY. The deployment linked to commit `86257139` completed successfully.

## Changes applied

1. Discovery now runs alone every 12 hours. It only stores newly discovered candidates; a repeated empty run does not trigger a content deployment.
2. Publication checks run independently. The runtime interval remains 48 hours; a check outside that interval returns `not_due`.
3. A newly visible article is first marked `pending_frontend_verification`. Only the delivery verifier can record `published_success`.
4. The verifier checks the News list, detail URL and News sitemap with HTTP requests before writing the delivery result.
5. A public Mining Weekly adapter was added as an additional industry source. It extracts only public article metadata and derives publication dates from public article URLs.
6. The source freshness window now prioritises the last 30 days and permits an auditable fallback up to 90 days. This is a candidate-selection policy only; the existing independent-source and originality gates remain active.

## Remaining blocking work

The supplied 300-source catalogue must be imported verbatim into the raw catalogue and then normalised before it is allowed to drive production discovery. This audit intentionally does not mark that import as complete until the exact source document is persisted and each active crawler entry has a verified robots and access state.

## Rollback

Revert commits `b91b895a`, `b413c837`, `eb5d741e`, `d1178cb`, `1a486e1`, `b1b63b01`, `d7d022b6` and `86257139` in reverse order. Existing News records and the public News routes are not removed by these changes.
