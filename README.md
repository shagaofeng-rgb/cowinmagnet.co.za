# Cowinmagnet Southern Africa Local Prototype

This is a local-first static prototype for the Cowinmagnet Southern Africa regional site.

## Local Preview

Open `index.html` directly in a browser, or run:

```powershell
.\server.ps1 8090
```

Then visit:

```text
http://localhost:8090/en-za/
```

For the current local CMS preview started by Codex, visit:

```text
http://localhost:8099/en-za/
http://localhost:8099/admin/
```

Local admin login defaults:

```text
Username: admin
Password: admin123
```

Before any non-local preview, set `ADMIN_USER`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` in the environment.

## Local CMS and API

The PowerShell preview server now includes local JSON API routes:

- `POST /api/login`
- `GET /api/session`
- `POST /api/logout`
- `GET /api/admin/dashboard`
- `GET /api/admin/products`
- `PUT /api/admin/products/{slug}`
- `POST /api/enquiries`
- `GET /api/admin/enquiries`
- `PUT /api/admin/enquiries/{id}`
- `GET|PUT /api/admin/settings`
- `GET /api/admin/audit-logs`

Persisted local CMS files:

- `data/products/products.json`
- `data/cms/enquiries.json`
- `data/cms/settings.json`
- `data/cms/audit-logs.json`

After editing products in the CMS, regenerate static public pages:

```powershell
.\tools\generate-static-site.ps1
```

## Sync Main Website Products

The regional site can sync public product pages from the main Cowinmagnet website without modifying the main site:

```powershell
.\tools\sync-main-products.ps1
.\tools\generate-static-site.ps1
```

The sync reads public product pages from `https://cowinmagnet.com/en/products`, stores product data in `data/source-sync/main-site-products.json`, copies public product images into `assets/images/source-products`, and regenerates regional product pages.

## Production Build

Before deploying the static public site, generate files with the production domain:

```powershell
$env:SITE_URL='https://cowinmagnet.co.za'
.\tools\generate-static-site.ps1
Remove-Item Env:SITE_URL
```

The generated production pages use `index,follow`, production canonical URLs, and a production `sitemap.xml` / `robots.txt`.

## Current Scope

- Southern Africa regional positioning with South Africa as the core market.
- Country landing content for South Africa, Zimbabwe, Zambia, Botswana, Namibia, Mozambique, Lesotho, Eswatini, and regional mining solutions.
- Product and application structure for magnetic separation equipment.
- Generated visual assets for the hero, product cards, quarrying, recycling, and port bulk-handling sections.
- Local CMS admin interface under `/admin/`.
- Server-side local inquiry capture stored in `data/cms/enquiries.json`.
- Product editor that writes back to `data/products/products.json`.
- Dashboard, content overview, SEO/language/media/users/settings/audit-log modules for local maintenance.
- Production-ready static public pages for `https://cowinmagnet.co.za`.
- Independent environment variable template for future deployment.

## Generated Image Assets

The images in `assets/images` are AI-generated illustrative website assets. They should not be described as verified customer projects, real local installations, local stock, local offices, or factory photos.

- `hero-mining-conveyor-magnet.png`
- `product-permanent-overband-magnet.png`
- `product-electromagnetic-separator.png`
- `application-quarry-aggregate.png`
- `application-recycling-separation.png`
- `application-port-bulk-handling.png`

## Not Yet Done

- No production database, storage bucket, email service, analytics, Search Console, or production admin account has been configured.
- No global-site production data has been modified.
