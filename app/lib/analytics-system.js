import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const TIMEZONE = "Africa/Johannesburg";
const MAX_EVENT_AGE_DAYS = 395;
const EVENT_TYPES = new Set(["pageview", "product_view", "quote_start", "quote_submit", "whatsapp_click", "download", "search"]);
let pool;
let schemaReady;

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function databaseConnectionString() {
  const value = process.env.DATABASE_URL || "";
  if (!value) return "";
  try {
    const url = new URL(value);
    url.searchParams.delete("ssl");
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return value;
  }
}

function getPool() {
  const connectionString = databaseConnectionString();
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

function id(prefix = "AN") {
  return `${prefix}-${crypto.randomBytes(9).toString("base64url")}`;
}

function maskedIp(value) {
  const ip = clean(value, 128);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d+$/, ".0");
  if (ip.includes(":")) return `${ip.split(":").slice(0, 4).join(":")}::`;
  return "unknown";
}

function hashIp(value) {
  const secret = process.env.ANALYTICS_HASH_SECRET || process.env.ADMIN_JWT_SECRET || "";
  if (!value || !secret) return null;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function hostFrom(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function pathFrom(value) {
  try {
    const parsed = new URL(String(value || "/"), "https://cowinmagnet.co.za");
    return `${parsed.pathname || "/"}${parsed.search || ""}`.slice(0, 700);
  } catch {
    return "/";
  }
}

function paramsFromPage(value) {
  try {
    const params = new URL(String(value || "/"), "https://cowinmagnet.co.za").searchParams;
    return {
      source: clean(params.get("utm_source"), 120),
      medium: clean(params.get("utm_medium"), 120),
      campaign: clean(params.get("utm_campaign"), 180),
      content: clean(params.get("utm_content"), 180),
      term: clean(params.get("utm_term"), 180)
    };
  } catch {
    return { source: "", medium: "", campaign: "", content: "", term: "" };
  }
}

function sourceFromReferrer(referrer) {
  const host = hostFrom(referrer);
  if (!host) return { channel: "Direct", source: "Direct" };
  if (/google\.|bing\.|yahoo\.|duckduckgo\.|baidu\./i.test(host)) return { channel: "Organic Search", source: host };
  if (/linkedin\.com|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com/i.test(host)) return { channel: "Social", source: host };
  if (/mail\.|outlook\.|gmail\.|mailchimp\.|sendgrid\./i.test(host)) return { channel: "Email", source: host };
  if (/wa\.me|whatsapp\.com/i.test(host)) return { channel: "WhatsApp", source: host };
  return { channel: "Referral", source: host };
}

function normalizeChannel(medium, fallback) {
  const value = clean(medium, 120).toLowerCase();
  if (!value) return fallback;
  if (/^(cpc|ppc|paid|display|banner|affiliate)$/.test(value)) return "Paid";
  if (/^(email|newsletter)$/.test(value)) return "Email";
  if (/^(social|paid-social)$/.test(value)) return "Social";
  if (/^(whatsapp|wa)$/.test(value)) return "WhatsApp";
  if (/^(organic|seo)$/.test(value)) return "Organic Search";
  if (/^(referral|partner)$/.test(value)) return "Referral";
  if (/^(direct|none)$/.test(value)) return "Direct";
  return "Other";
}

function isBot(userAgent) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|lighthouse|pagespeed|headless|playwright|puppeteer|curl|wget|postman/i.test(userAgent);
}

function configuredPatterns(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function includesPattern(value, patterns) {
  const normalized = String(value || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

async function ensureAnalyticsSchema() {
  const db = getPool();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS africa_json_documents (
        path TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL,
        visitor_id TEXT NOT NULL,
        session_id TEXT,
        event_type TEXT NOT NULL,
        page_path TEXT NOT NULL,
        referrer TEXT NOT NULL DEFAULT '',
        referrer_host TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT 'Direct',
        source TEXT NOT NULL DEFAULT 'Direct',
        medium TEXT NOT NULL DEFAULT '',
        campaign TEXT NOT NULL DEFAULT '',
        campaign_content TEXT NOT NULL DEFAULT '',
        campaign_term TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'Unknown',
        language TEXT NOT NULL DEFAULT 'en-za',
        device TEXT NOT NULL DEFAULT 'Desktop',
        browser TEXT NOT NULL DEFAULT 'Browser',
        ip_hash TEXT,
        ip_masked TEXT NOT NULL DEFAULT 'unknown',
        user_agent TEXT NOT NULL DEFAULT '',
        is_bot BOOLEAN NOT NULL DEFAULT FALSE,
        is_internal BOOLEAN NOT NULL DEFAULT FALSE,
        is_test BOOLEAN NOT NULL DEFAULT FALSE,
        exclusion_reason TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Upgrade legacy analytics tables in place. CREATE TABLE IF NOT EXISTS does
      -- not add columns to an older production table, so add every required
      -- reporting field before creating indexes or reading real visitor data.
      ALTER TABLE analytics_events
        ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS visitor_id TEXT,
        ADD COLUMN IF NOT EXISTS session_id TEXT,
        ADD COLUMN IF NOT EXISTS event_type TEXT,
        ADD COLUMN IF NOT EXISTS page_path TEXT,
        ADD COLUMN IF NOT EXISTS referrer TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS referrer_host TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'Direct',
        ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Direct',
        ADD COLUMN IF NOT EXISTS medium TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS campaign TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS campaign_content TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS campaign_term TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Unknown',
        ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en-za',
        ADD COLUMN IF NOT EXISTS device TEXT DEFAULT 'Desktop',
        ADD COLUMN IF NOT EXISTS browser TEXT DEFAULT 'Browser',
        ADD COLUMN IF NOT EXISTS ip_hash TEXT,
        ADD COLUMN IF NOT EXISTS ip_masked TEXT DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS exclusion_reason TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

      UPDATE analytics_events
      SET occurred_at = COALESCE(occurred_at, created_at, NOW()),
          visitor_id = COALESCE(NULLIF(visitor_id, ''), 'legacy-' || id::text),
          event_type = COALESCE(NULLIF(event_type, ''), 'pageview'),
          page_path = COALESCE(NULLIF(page_path, ''), '/'),
          country = COALESCE(NULLIF(country, ''), 'Unknown'),
          language = COALESCE(NULLIF(language, ''), 'en-za'),
          device = COALESCE(NULLIF(device, ''), 'Desktop'),
          browser = COALESCE(NULLIF(browser, ''), 'Browser'),
          channel = COALESCE(NULLIF(channel, ''), 'Direct'),
          source = COALESCE(NULLIF(source, ''), 'Direct'),
          referrer = COALESCE(referrer, ''),
          referrer_host = COALESCE(referrer_host, ''),
          medium = COALESCE(medium, ''),
          campaign = COALESCE(campaign, ''),
          campaign_content = COALESCE(campaign_content, ''),
          campaign_term = COALESCE(campaign_term, ''),
          ip_masked = COALESCE(NULLIF(ip_masked, ''), 'unknown'),
          user_agent = COALESCE(user_agent, ''),
          is_bot = COALESCE(is_bot, FALSE),
          is_internal = COALESCE(is_internal, FALSE),
          is_test = COALESCE(is_test, FALSE),
          exclusion_reason = COALESCE(exclusion_reason, ''),
          metadata = COALESCE(metadata, '{}'::jsonb)
      WHERE occurred_at IS NULL
         OR visitor_id IS NULL OR visitor_id = ''
         OR event_type IS NULL OR event_type = ''
         OR page_path IS NULL OR page_path = '';

      CREATE INDEX IF NOT EXISTS analytics_events_time_idx ON analytics_events (occurred_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON analytics_events (visitor_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_events_filters_idx ON analytics_events (is_bot, is_internal, is_test, country, channel, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_events_page_idx ON analytics_events (page_path, occurred_at DESC);

      CREATE TABLE IF NOT EXISTS analytics_visitors (
        visitor_id TEXT PRIMARY KEY,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        last_session_id TEXT,
        visit_count INTEGER NOT NULL DEFAULT 1,
        pageview_count INTEGER NOT NULL DEFAULT 0,
        country TEXT NOT NULL DEFAULT 'Unknown',
        language TEXT NOT NULL DEFAULT 'en-za',
        device TEXT NOT NULL DEFAULT 'Desktop',
        browser TEXT NOT NULL DEFAULT 'Browser',
        ip_hash TEXT,
        ip_masked TEXT NOT NULL DEFAULT 'unknown',
        lead_status TEXT NOT NULL DEFAULT 'Anonymous',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS analytics_exclusion_rules (
        id TEXT PRIMARY KEY,
        rule_key TEXT NOT NULL UNIQUE,
        rule_type TEXT NOT NULL,
        pattern TEXT NOT NULL,
        label TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL DEFAULT 'system'
      );

      CREATE TABLE IF NOT EXISTS analytics_migrations (
        migration_key TEXT PRIMARY KEY,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        detail JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      INSERT INTO analytics_exclusion_rules (id, rule_key, rule_type, pattern, label)
      VALUES
        ('RULE-bot', 'system-bot-user-agent', 'user_agent', 'bot|crawler|spider|lighthouse|headless|playwright|puppeteer|curl|postman', 'Known bots and automated test clients'),
        ('RULE-collect', 'system-collector-source', 'referrer', 'collect|collector|localhost|127.0.0.1', 'Collects, local and collector traffic')
      ON CONFLICT (rule_key) DO NOTHING;
    `).then(() => true);
  }
  return schemaReady;
}

async function legacyMigration(legacyEvents) {
  const db = getPool();
  if (!db || !Array.isArray(legacyEvents) || !legacyEvents.length) return { imported: 0, skipped: true };
  await ensureAnalyticsSchema();
  const existing = await db.query("SELECT migration_key FROM analytics_migrations WHERE migration_key = $1", ["analytics-legacy-v1"]);
  if (existing.rowCount) return { imported: 0, skipped: true };

  const client = await db.connect();
  let imported = 0;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO africa_json_documents (path, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (path) DO NOTHING`,
      ["data/backups/analytics-events-before-normalization-v1.json", JSON.stringify(legacyEvents)]
    );
    for (const item of legacyEvents.slice(-5000)) {
      const eventId = clean(item.id, 120) || id("LEG");
      const occurredAt = Number.isNaN(Date.parse(item.time)) ? new Date().toISOString() : new Date(item.time).toISOString();
      const userAgent = clean(item.userAgent, 900);
      const bot = isBot(userAgent);
      const test = /local preview|localhost|127\.0\.0\.1|collect/i.test(`${item.country || ""} ${item.page || ""} ${item.sourceDetail || ""}`);
      const insert = await client.query(
        `INSERT INTO analytics_events (
          id, occurred_at, visitor_id, session_id, event_type, page_path, referrer, referrer_host,
          channel, source, country, language, device, browser, ip_masked, user_agent,
          is_bot, is_internal, is_test, exclusion_reason, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)
        ON CONFLICT (id) DO NOTHING`,
        [
          eventId, occurredAt, clean(item.clientId, 140) || `legacy-${eventId}`, clean(item.sessionId, 140),
          clean(item.eventType, 80) || "pageview", pathFrom(item.page), clean(item.sourceDetail, 700),
          hostFrom(item.sourceDetail), clean(item.source, 120) || "Direct", clean(item.source, 180) || "Direct",
          clean(item.country, 80) || "Unknown", clean(item.language, 40) || "en-za", clean(item.device, 80) || "Desktop",
          clean(item.browser, 120) || "Browser", clean(item.ip, 120) || "unknown", userAgent, bot, false, test,
          bot ? "historical_bot" : (test ? "historical_test_or_collector" : ""), JSON.stringify({ legacy: true })
        ]
      );
      imported += insert.rowCount || 0;
    }
    await client.query(
      "INSERT INTO analytics_migrations (migration_key, detail) VALUES ($1, $2::jsonb)",
      ["analytics-legacy-v1", JSON.stringify({ imported, sourceCount: legacyEvents.length })]
    );
    await client.query("COMMIT");
    return { imported, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function matchingRule(fields) {
  const db = getPool();
  if (!db) return null;
  const rules = await db.query("SELECT rule_type, pattern, label FROM analytics_exclusion_rules WHERE enabled = TRUE");
  for (const rule of rules.rows) {
    const value = String(fields[rule.rule_type] || "").toLowerCase();
    const patterns = String(rule.pattern || "").toLowerCase().split("|").map((part) => part.trim()).filter(Boolean);
    if (patterns.some((pattern) => value.includes(pattern))) return rule.label;
  }
  return null;
}

function trackingOriginAllowed(requestHeaders) {
  const origin = requestHeaders.get("origin");
  if (!origin) return true;
  const originHost = hostFrom(origin);
  const requestHost = clean(requestHeaders.get("host"), 255).toLowerCase().split(":")[0];
  return Boolean(originHost && requestHost && originHost === requestHost);
}

function trackingFlags({ requestHeaders, pagePath, referrer, userAgent, attribution, rawIp, ruleLabel }) {
  const host = clean(requestHeaders.get("host"), 255).toLowerCase();
  const isAutomated = isBot(userAgent);
  const isPreview = host.includes("vercel.app") || /localhost|127\.0\.0\.1|collect|collector/i.test(`${pagePath} ${referrer} ${attribution.source} ${attribution.medium}`);
  const internalIp = includesPattern(rawIp, configuredPatterns("ANALYTICS_INTERNAL_IP_PREFIXES"));
  const internalVisitor = includesPattern(attribution.visitorId, configuredPatterns("ANALYTICS_EXCLUDED_VISITOR_IDS"));
  const excludedSource = includesPattern(`${attribution.source} ${attribution.medium} ${attribution.campaign}`, configuredPatterns("ANALYTICS_EXCLUDED_SOURCES"));
  const internal = internalIp || internalVisitor || excludedSource;
  const reasons = [
    isAutomated ? "automated_client" : "",
    isPreview ? "test_or_collects" : "",
    internal ? "internal_rule" : "",
    ruleLabel ? `rule:${ruleLabel}` : ""
  ].filter(Boolean);
  return { isBot: isAutomated, isTest: isPreview, isInternal: internal, exclusionReason: reasons.join(", ") };
}

function rangeClause(input, values) {
  const range = clean(input.get("range") || "7d", 16);
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (range === "today") return { clause: `e.occurred_at >= date_trunc('day', NOW() AT TIME ZONE '${TIMEZONE}') AT TIME ZONE '${TIMEZONE}'`, range };
  if (range === "yesterday") return { clause: `e.occurred_at >= (date_trunc('day', NOW() AT TIME ZONE '${TIMEZONE}') - INTERVAL '1 day') AT TIME ZONE '${TIMEZONE}' AND e.occurred_at < date_trunc('day', NOW() AT TIME ZONE '${TIMEZONE}') AT TIME ZONE '${TIMEZONE}'`, range };
  if (range === "30d") return { clause: "e.occurred_at >= NOW() - INTERVAL '30 days'", range };
  if (range === "month") return { clause: `e.occurred_at >= date_trunc('month', NOW() AT TIME ZONE '${TIMEZONE}') AT TIME ZONE '${TIMEZONE}'`, range };
  if (range === "custom") {
    const from = clean(input.get("from"), 40);
    const to = clean(input.get("to"), 40);
    if (from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to))) {
      const start = add(new Date(from).toISOString());
      const end = add(new Date(to).toISOString());
      return { clause: `e.occurred_at >= ${start}::timestamptz AND e.occurred_at < ${end}::timestamptz`, range };
    }
  }
  return { clause: "e.occurred_at >= NOW() - INTERVAL '7 days'", range: "7d" };
}

function filterSql(searchParams, values) {
  const range = rangeClause(searchParams, values);
  const where = [range.clause];
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (searchParams.get("includeExcluded") !== "1") where.push("e.is_bot = FALSE AND e.is_internal = FALSE AND e.is_test = FALSE");
  for (const [param, column] of [["country", "e.country"], ["channel", "e.channel"], ["device", "e.device"]]) {
    const value = clean(searchParams.get(param), 120);
    if (value) where.push(`${column} = ${add(value)}`);
  }
  const page = clean(searchParams.get("pagePath"), 700);
  if (page) where.push(`e.page_path ILIKE ${add(`%${page}%`)}`);
  const visitorType = clean(searchParams.get("visitorType"), 20);
  if (visitorType === "new") where.push("COALESCE(v.visit_count, 1) <= 1");
  if (visitorType === "returning") where.push("COALESCE(v.visit_count, 1) > 1");
  const q = clean(searchParams.get("q"), 180);
  if (q) where.push(`(e.visitor_id ILIKE ${add(`%${q}%`)} OR e.ip_masked ILIKE ${add(`%${q}%`)} OR e.page_path ILIKE ${add(`%${q}%`)})`);
  return { where: where.join(" AND "), range: range.range };
}

export async function recordAnalyticsEvent({ requestHeaders, body = {} }) {
  const db = getPool();
  if (!db) {
    const error = new Error("Analytics persistent storage is not configured.");
    error.code = "ANALYTICS_STORAGE_UNAVAILABLE";
    throw error;
  }
  if (!trackingOriginAllowed(requestHeaders)) {
    const error = new Error("Tracking origin is not allowed.");
    error.code = "TRACKING_ORIGIN_REJECTED";
    throw error;
  }
  await ensureAnalyticsSchema();
  const pagePath = pathFrom(body.page);
  const referrer = clean(requestHeaders.get("referer") || body.referrer, 700);
  const userAgent = clean(requestHeaders.get("user-agent"), 900);
  const rawIp = clean(requestHeaders.get("x-forwarded-for")?.split(",")[0] || requestHeaders.get("x-real-ip"), 128);
  const pageParams = paramsFromPage(body.page);
  const referrerAttribution = sourceFromReferrer(referrer);
  const attribution = {
    visitorId: clean(body.clientId, 140) || id("VIS"),
    sessionId: clean(body.sessionId, 140) || id("SES"),
    source: clean(body.utmSource || pageParams.source || referrerAttribution.source, 180) || referrerAttribution.source,
    medium: clean(body.utmMedium || pageParams.medium, 120),
    campaign: clean(body.utmCampaign || pageParams.campaign, 180),
    content: clean(body.utmContent || pageParams.content, 180),
    term: clean(body.utmTerm || pageParams.term, 180)
  };
  const channel = normalizeChannel(attribution.medium, referrerAttribution.channel);
  const ruleLabel = await matchingRule({
    user_agent: userAgent,
    referrer,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    visitor_id: attribution.visitorId,
    ip_prefix: rawIp
  });
  const flags = trackingFlags({ requestHeaders, pagePath, referrer, userAgent, attribution, rawIp, ruleLabel });
  const eventType = EVENT_TYPES.has(clean(body.eventType, 80)) ? clean(body.eventType, 80) : "pageview";
  const occurredAt = new Date();
  const eventId = id("EVT");
  const country = clean(requestHeaders.get("x-vercel-ip-country"), 80) || "Unknown";
  const event = {
    eventId,
    occurredAt: occurredAt.toISOString(),
    visitorId: attribution.visitorId,
    sessionId: attribution.sessionId,
    eventType,
    pagePath,
    referrer,
    referrerHost: hostFrom(referrer),
    channel,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    campaignContent: attribution.content,
    campaignTerm: attribution.term,
    country,
    language: clean(body.language, 40) || "en-za",
    device: clean(body.device, 80) || "Desktop",
    browser: clean(body.browser, 120) || "Browser",
    ipHash: hashIp(rawIp),
    ipMasked: maskedIp(rawIp),
    userAgent,
    ...flags
  };
  await db.query(
    `INSERT INTO analytics_events (
      id, occurred_at, visitor_id, session_id, event_type, page_path, referrer, referrer_host,
      channel, source, medium, campaign, campaign_content, campaign_term, country, language,
      device, browser, ip_hash, ip_masked, user_agent, is_bot, is_internal, is_test, exclusion_reason, metadata
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb
    )`,
    [
      event.eventId, event.occurredAt, event.visitorId, event.sessionId, event.eventType, event.pagePath, event.referrer,
      event.referrerHost, event.channel, event.source, event.medium, event.campaign, event.campaignContent, event.campaignTerm,
      event.country, event.language, event.device, event.browser, event.ipHash, event.ipMasked, event.userAgent,
      event.isBot, event.isInternal, event.isTest, event.exclusionReason, JSON.stringify({ collector: "site.js" })
    ]
  );
  if (!event.isBot && !event.isInternal && !event.isTest && event.eventType === "pageview") {
    await db.query(
      `INSERT INTO analytics_visitors (
        visitor_id, first_seen_at, last_seen_at, last_session_id, visit_count, pageview_count,
        country, language, device, browser, ip_hash, ip_masked
      ) VALUES ($1,$2,$2,$3,1,1,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (visitor_id) DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        last_session_id = EXCLUDED.last_session_id,
        visit_count = analytics_visitors.visit_count + CASE WHEN analytics_visitors.last_session_id IS DISTINCT FROM EXCLUDED.last_session_id THEN 1 ELSE 0 END,
        pageview_count = analytics_visitors.pageview_count + 1,
        country = EXCLUDED.country,
        language = EXCLUDED.language,
        device = EXCLUDED.device,
        browser = EXCLUDED.browser,
        ip_hash = COALESCE(EXCLUDED.ip_hash, analytics_visitors.ip_hash),
        ip_masked = EXCLUDED.ip_masked,
        updated_at = NOW()`,
      [event.visitorId, event.occurredAt, event.sessionId, event.country, event.language, event.device, event.browser, event.ipHash, event.ipMasked]
    );
  }
  return {
    id: eventId,
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    excluded: Boolean(event.isBot || event.isInternal || event.isTest),
    exclusionReason: event.exclusionReason || null
  };
}

export async function migrateLegacyAnalyticsEvents(events) {
  return legacyMigration(events);
}

export async function getAnalyticsReport(url) {
  const db = getPool();
  if (!db) {
    const error = new Error("Analytics persistent storage is not configured.");
    error.code = "ANALYTICS_STORAGE_UNAVAILABLE";
    throw error;
  }
  await ensureAnalyticsSchema();
  const searchParams = url instanceof URL ? url.searchParams : new URL(url, "https://cowinmagnet.co.za").searchParams;
  const values = [];
  const filters = filterSql(searchParams, values);
  const source = `FROM analytics_events e LEFT JOIN analytics_visitors v ON v.visitor_id = e.visitor_id WHERE ${filters.where}`;
  const page = Math.max(1, Math.min(100000, Number(searchParams.get("page") || 1)));
  const pageSize = Math.max(20, Math.min(100, Number(searchParams.get("pageSize") || 20)));
  const offset = (page - 1) * pageSize;

  const [summaryResult, countriesResult, channelsResult, pagesResult, devicesResult, timelineResult, visitorCountResult] = await Promise.all([
    db.query(`SELECT
      COUNT(*) FILTER (WHERE e.event_type = 'pageview')::int AS pv,
      COUNT(DISTINCT e.visitor_id)::int AS uv,
      COUNT(DISTINCT e.session_id)::int AS sessions,
      COUNT(*) FILTER (WHERE e.event_type = 'quote_submit')::int AS enquiries,
      COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::int AS whatsapp_clicks,
      COUNT(*) FILTER (WHERE e.is_bot OR e.is_internal OR e.is_test)::int AS excluded
      ${source}`, values),
    db.query(`SELECT COALESCE(e.country, 'Unknown') AS name, COUNT(*)::int AS count ${source} GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 12`, values),
    db.query(`SELECT COALESCE(e.channel, 'Direct') AS name, COUNT(*)::int AS count ${source} GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 12`, values),
    db.query(`SELECT e.page_path AS page, COUNT(*)::int AS pv, COUNT(DISTINCT e.visitor_id)::int AS uv ${source} AND e.event_type = 'pageview' GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 20`, values),
    db.query(`SELECT CONCAT(COALESCE(e.device, 'Desktop'), ' / ', COALESCE(e.browser, 'Browser')) AS name, COUNT(*)::int AS count ${source} GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 12`, values),
    db.query(`SELECT to_char(date_trunc('hour', e.occurred_at AT TIME ZONE '${TIMEZONE}'), 'YYYY-MM-DD HH24:00') AS bucket, COUNT(*)::int AS pv, COUNT(DISTINCT e.visitor_id)::int AS uv ${source} AND e.event_type = 'pageview' GROUP BY 1 ORDER BY 1 ASC LIMIT 240`, values),
    db.query(`SELECT COUNT(DISTINCT e.visitor_id)::int AS total ${source}`, values)
  ]);

  const visitorValues = [...values, pageSize, offset];
  const visitorsResult = await db.query(
    `SELECT
      e.visitor_id AS "visitorId",
      MAX(e.occurred_at) AS "lastSeenAt",
      MIN(e.occurred_at) AS "firstSeenAt",
      MAX(COALESCE(e.country, 'Unknown')) AS country,
      MAX(COALESCE(e.ip_masked, 'unknown')) AS ip,
      MAX(COALESCE(e.channel, 'Direct')) AS channel,
      MAX(COALESCE(e.source, 'Direct')) AS source,
      MAX(COALESCE(e.device, 'Desktop')) AS device,
      MAX(COALESCE(e.browser, 'Browser')) AS browser,
      MAX(COALESCE(v.visit_count, 1))::int AS "visitCount",
      COUNT(*) FILTER (WHERE e.event_type = 'pageview')::int AS pv,
      (array_agg(e.page_path ORDER BY e.occurred_at DESC))[1] AS "lastPage",
      MAX(COALESCE(v.lead_status, 'Anonymous')) AS "leadStatus"
    ${source}
    GROUP BY e.visitor_id
    ORDER BY MAX(e.occurred_at) DESC
    LIMIT $${visitorValues.length - 1} OFFSET $${visitorValues.length}`,
    visitorValues
  );

  const summary = summaryResult.rows[0] || {};
  const pv = Number(summary.pv || 0);
  const enquiries = Number(summary.enquiries || 0);
  return {
    storageMode: "postgresql",
    timezone: TIMEZONE,
    filters: {
      range: filters.range,
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      country: searchParams.get("country") || "",
      channel: searchParams.get("channel") || "",
      device: searchParams.get("device") || "",
      visitorType: searchParams.get("visitorType") || "",
      includeExcluded: searchParams.get("includeExcluded") === "1"
    },
    pv,
    uv: Number(summary.uv || 0),
    sessions: Number(summary.sessions || 0),
    enquiries,
    whatsappClicks: Number(summary.whatsapp_clicks || 0),
    excluded: Number(summary.excluded || 0),
    conversionRate: pv ? Number(((enquiries / pv) * 100).toFixed(2)) : 0,
    countries: countriesResult.rows,
    sources: channelsResult.rows.map((item) => ({ source: item.name, pv: Number(item.count || 0), uv: 0 })),
    channels: channelsResult.rows,
    pages: pagesResult.rows,
    deviceBrowsers: devicesResult.rows.map((item) => {
      const [device, browser] = String(item.name).split(" / ");
      return { device, browser, views: Number(item.count || 0) };
    }),
    timeline: timelineResult.rows,
    visitors: {
      items: visitorsResult.rows,
      page,
      pageSize,
      total: Number(visitorCountResult.rows[0]?.total || 0),
      totalPages: Math.max(1, Math.ceil(Number(visitorCountResult.rows[0]?.total || 0) / pageSize))
    },
    lastSync: new Date().toISOString()
  };
}

export async function getAnalyticsExclusionRules() {
  const db = getPool();
  if (!db) return { storageMode: "unconfigured", items: [] };
  await ensureAnalyticsSchema();
  const rows = await db.query("SELECT id, rule_key AS \"ruleKey\", rule_type AS \"ruleType\", pattern, label, enabled, created_at AS \"createdAt\", updated_at AS \"updatedAt\", updated_by AS \"updatedBy\" FROM analytics_exclusion_rules ORDER BY created_at ASC");
  return { storageMode: "postgresql", items: rows.rows };
}

export async function saveAnalyticsExclusionRule(input, actor = "admin") {
  const db = getPool();
  if (!db) throw new Error("Analytics persistent storage is not configured.");
  await ensureAnalyticsSchema();
  const ruleType = clean(input.ruleType, 40);
  const allowed = new Set(["user_agent", "referrer", "source", "medium", "campaign", "visitor_id", "ip_prefix"]);
  if (!allowed.has(ruleType)) throw new Error("Unsupported exclusion rule type.");
  const ruleKey = clean(input.ruleKey, 100) || `${ruleType}-${crypto.createHash("sha256").update(clean(input.pattern, 160)).digest("hex").slice(0, 12)}`;
  const pattern = clean(input.pattern, 180).toLowerCase();
  const label = clean(input.label, 180);
  if (!pattern || !label) throw new Error("Rule label and pattern are required.");
  const record = {
    id: clean(input.id, 100) || id("RULE"),
    ruleKey,
    ruleType,
    pattern,
    label,
    enabled: input.enabled !== false,
    actor: clean(actor, 180) || "admin"
  };
  await db.query(
    `INSERT INTO analytics_exclusion_rules (id, rule_key, rule_type, pattern, label, enabled, updated_at, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
      ON CONFLICT (rule_key) DO UPDATE SET rule_type = EXCLUDED.rule_type, pattern = EXCLUDED.pattern, label = EXCLUDED.label, enabled = EXCLUDED.enabled, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [record.id, record.ruleKey, record.ruleType, record.pattern, record.label, record.enabled, record.actor]
  );
  return record;
}


export async function getAnalyticsVisitorJourney(visitorId) {
  const db = getPool();
  if (!db) return { storageMode: "unconfigured", visitor: null, items: [] };
  await ensureAnalyticsSchema();
  const normalizedId = clean(visitorId, 160);
  if (!normalizedId) throw new Error("Visitor identifier is required.");
  const [visitorResult, eventsResult] = await Promise.all([
    db.query(
      `SELECT visitor_id AS "visitorId", MIN(occurred_at) AS "firstSeenAt", MAX(occurred_at) AS "lastSeenAt",
        COUNT(*) FILTER (WHERE event_type = 'pageview')::int AS pv,
        MAX(COALESCE(country, 'Unknown')) AS country, MAX(COALESCE(ip_masked, 'unknown')) AS ip,
        MAX(COALESCE(channel, 'Direct')) AS channel, MAX(COALESCE(source, 'Direct')) AS source,
        MAX(COALESCE(device, 'Desktop')) AS device, MAX(COALESCE(browser, 'Browser')) AS browser,
        MAX(COALESCE(v.lead_status, 'Anonymous')) AS "leadStatus"
       FROM analytics_events e
       LEFT JOIN analytics_visitors v ON v.visitor_id = e.visitor_id
       WHERE e.visitor_id = $1 AND NOT (e.is_bot OR e.is_internal OR e.is_test)
       GROUP BY e.visitor_id`,
      [normalizedId]
    ),
    db.query(
      `SELECT occurred_at AS time, event_type AS "eventType", page_path AS page,
        COALESCE(channel, 'Direct') AS channel, COALESCE(source, 'Direct') AS source,
        referrer, utm_source AS "utmSource", utm_medium AS "utmMedium", utm_campaign AS "utmCampaign"
       FROM analytics_events
       WHERE visitor_id = $1 AND NOT (is_bot OR is_internal OR is_test)
       ORDER BY occurred_at DESC LIMIT 100`,
      [normalizedId]
    )
  ]);
  return { storageMode: "postgresql", visitor: visitorResult.rows[0] || null, items: eventsResult.rows };
}


export async function updateAnalyticsVisitor(visitorId, input = {}) {
  const db = getPool();
  if (!db) throw new Error("Analytics persistent storage is not configured.");
  await ensureAnalyticsSchema();
  const normalizedId = clean(visitorId, 160);
  const allowed = new Set(["Anonymous", "Potential lead", "Lead", "Customer", "Excluded"]);
  const leadStatus = clean(input.leadStatus, 40);
  if (!normalizedId || !allowed.has(leadStatus)) throw new Error("A valid visitor category is required.");
  const existing = await db.query("SELECT visitor_id FROM analytics_visitors WHERE visitor_id = $1", [normalizedId]);
  if (!existing.rowCount) throw new Error("Visitor record was not found.");
  await db.query("UPDATE analytics_visitors SET lead_status = $2, updated_at = NOW() WHERE visitor_id = $1", [normalizedId, leadStatus]);
  return { visitorId: normalizedId, leadStatus };
}

export async function analyticsHealth() {
  const db = getPool();
  if (!db) return { configured: false, mode: "unconfigured", message: "DATABASE_URL is not configured." };
  await ensureAnalyticsSchema();
  const result = await db.query("SELECT COUNT(*)::int AS events, MAX(occurred_at) AS latest_event FROM analytics_events");
  return {
    configured: true,
    mode: "postgresql",
    events: Number(result.rows[0]?.events || 0),
    latestEventAt: result.rows[0]?.latest_event || null
  };
}
