# News automation operating policy

The legacy News publisher was removed before this system was introduced. This implementation is a separate, auditable editorial queue and is deliberately disabled in production until all safeguards are satisfied.

## Production gate

Set `NEWS_AUTOPUBLISH_ENABLED=true` and `NEWS_AUTOPUBLISH_MODE=production` only after six preproduction drafts have a passed quality review. The cron handler records a blocked run when any gate is unmet; it never creates an article merely because a schedule fired.

Each draft must have two independent, reachable sources, fresh publication dates, an approved COWIN product truth card, owned or licensed local media, 900-1,500 words, unique wording, working links, and no internal authoring fields. A failed draft remains recorded as rejected and is never published.

## Data and recovery

Queue data is stored under `data/news-automation/` and uses PostgreSQL in production through the existing JSON document store. Runs use a database advisory lock, idempotent run IDs and a retry limit of two. To pause publishing, set `NEWS_AUTOPUBLISH_ENABLED=false` and redeploy. Existing News and Blog articles are not removed by this process.

## Admin API

Authenticated administrators can read `GET /api/admin/news-automation`, add a source with `POST /api/admin/news-automation/sources`, and submit a draft to the QA gate with `POST /api/admin/news-automation/review`. These endpoints record review data only; they do not bypass the production gate.
