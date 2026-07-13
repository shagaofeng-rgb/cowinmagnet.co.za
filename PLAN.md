# News Automation Release Plan (2026-07-13)

## Objective

Publish up to four source-attributed, product-relevant English news articles per Africa/Johannesburg calendar day without copying source articles, inventing claims, hotlinking or copying unlicensed editorial images, or silently losing data.

## Implemented Controls

- Public RSS sources are allowlisted by domain, HTTPS-only, response-size limited, timeout protected, and rejected when source dates are outside the 72-hour window.
- URL, title, source fingerprint, event fingerprint, and title-overlap deduplication run over a seven-day rolling window.
- Articles require at least one real product relation. New article covers use an owned Cowin Magnet product image with an explicit caption stating that it is not a photo of the reported event.
- Public news pages, RSS, sitemap generation, and the News sitemap use a read-only bundled-data fallback when PostgreSQL is unavailable, so a storage incident does not create public 500 responses.
- Production writes are fail-closed: a Vercel function will not claim publication when the durable database is unavailable. The job returns `blocked` and can notify `NEWS_ALERT_WEBHOOK_URL`.
- Each run records source health, candidate counts, rejection reasons, publish counts, and the daily target audit in durable storage when storage is healthy.

## Runtime Configuration

```text
DATABASE_URL=required for production writes
CRON_SECRET=required for /api/cron/news
NEWS_DAILY_TARGET=4
NEWS_TIMEZONE=Africa/Johannesburg
NEWS_LOOKBACK_HOURS=72
NEWS_DEDUP_DAYS=7
NEWS_RELEVANCE_THRESHOLD=0.18
NEWS_AUTO_PUBLISH=true
NEWS_ALERT_WEBHOOK_URL=https://<approved-alert-endpoint>
```

`DATABASE_URL` is currently provisioned but has exceeded its provider data-transfer quota. Public fallback remains available, but the quota must be restored in the database provider before scheduled production publishing can commit new articles.

## Verification and Release

1. Run `npm run test:news`, `npm run test:sitemap`, `npm run test:schema`, and `npm run build`.
2. Verify `/en-za/news/`, `/en-za/news/feed.xml`, `/news-sitemap.xml`, `/sitemap.xml`, `/robots.txt`, and an article detail page return HTTP 200 after deployment.
3. Invoke the authenticated News cron once only after durable storage is healthy; verify News Job, daily audit, source health, article detail, related product API, feed, and sitemap output.
4. Vercel Cron continues on a three-hour cadence for collection, retry, and daily backfill. A missed target or storage failure must remain visible in News Jobs and the configured alert channel.

# 海外 B2B 中文管理后台实施计划

## 当前项目情况
- 项目为 Next.js App Router，后台静态资源位于 `admin/`，后台 API 位于 `app/api/[...path]/route.js`。
- 生产部署在 Vercel，项目已配置 `DATABASE_URL`，现有后台数据通过 `africa_json_documents` 持久化到 PostgreSQL，开发环境可回退到本地 `data/` JSON 文件。
- 已有模块：登录、数据概览、访问分析、产品管理、新闻管理、SEO 数据、链接检查、设置、操作日志基础、Google Search Console 同步。
- 当前工作区存在非本任务遗留改动：Blog 渲染、文章与 sitemap 相关文件。本次实施不回滚这些改动。

## 技术架构
- 前端后台：原生 HTML/CSS/JS，新增 `admin/admin-v2.js` 承载中文后台交互。
- 服务端：Next.js API Route，统一返回 `{ success, data, error, requestId }`。
- 存储：生产 PostgreSQL JSON 文档表；开发本地 JSON 文件。
- 同步：Vercel Cron + 后台手动同步接口。
- 部署：GitHub main 分支触发 Vercel Production。

## 数据库设计
- 第一阶段沿用现有 `africa_json_documents(path, payload, updated_at)` 持久层，保证不破坏现有线上数据。
- 新增逻辑数据文档：
  - `data/cms/users.json`
  - `data/cms/roles.json`
  - `data/media/assets.json`
  - `data/seo/google-search-console.json`
  - `data/seo/google-seo-jobs.json`
- 后续可迁移为 PDF 建议的实体表：User、Role、ProductCategory、Product、NewsArticle、FormSubmission、SeoMetric、SyncJob、AuditLog 等。

## 功能模块
- 数据概览：PV/UV/产品/询盘/SEO/同步状态。
- 产品分类：搜索、分页、新增、编辑、启用、停用、软删除、恢复、导出。
- 产品管理：搜索、分页、编辑基础字段、SEO 字段、导出。
- 新闻管理：搜索、分页、编辑、发布状态、自动新闻同步。
- 客户表单：搜索、筛选、分页、状态修改、负责人、备注、导出。
- 访问分析：来源、国家、设备、页面、访客、路径。
- SEO 数据：站内 SEO 检查、Google Search Console 同步。
- 媒体库：媒体资产登记、搜索、分页、替代文字和使用位置。
- 用户与权限：用户、角色、模块权限配置的可管理数据结构。
- 操作日志：查询、筛选、导出。
- 数据同步：新闻、Google SEO、存储模式和任务记录。
- 系统设置：站点信息、语言、市场覆盖、同步配置。

## 实施阶段
- 阶段一：修复中文后台壳、登录显示密码、创建计划文档。
- 阶段二：扩展后台 API：分页、分类、表单、用户权限、媒体、同步中心、审计日志。
- 阶段三：实现中文后台页面和交互，连接真实 API。
- 阶段四：构建、smoke test、生产部署、线上验证。

## 安全方案
- 所有 `/api/admin/*` 接口必须登录并通过 CSRF。
- 密码不明文存储，沿用现有哈希验证。
- API 密钥只通过环境变量配置，不提交 Git。
- 操作日志不记录密码、密钥、完整敏感令牌。
- 删除类操作采用软删除或二次确认前端提示。

## 测试方案
- `node --check admin/admin-v2.js`
- `npm run build`
- 新增后台 API smoke test，覆盖会话保护、分页工具、公开页面状态。
- 生产部署后检查 `/admin/`、`/admin/admin-v2.js`、核心 API 与 Vercel runtime errors。

## 部署方案
- 通过 GitHub push 触发 Vercel Production 部署。
- 生产域名：`https://cowinmagnet.co.za/`
- 回滚方式：Vercel 部署列表中回滚到上一条 READY 部署。

## 风险和待确认事项
- 完整实体表迁移、对象存储直传、富文本编辑器、Excel 导入预览、端到端权限矩阵属于下一阶段深度建设。
- 邮件通知、对象存储、CRM/Webhook 需要外部凭证后才能完全启用。
- 现有后台部分历史中文乱码会通过新后台脚本规避，旧脚本保留给登录页。
