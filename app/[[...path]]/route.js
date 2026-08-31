import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { renderBlogArticle, renderBlogFeed, renderBlogList } from "../lib/blog-renderer.js";
import { renderNewsArticle, renderNewsFeed, renderNewsList } from "../lib/news-renderer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = /*turbopackIgnore: true*/ process.cwd();
// Static HTML pages are generated as files, so their stylesheet URL needs a
// deployment version. This prevents a cached legacy stylesheet from rendering
// the current page structure as unstyled content after a release.
const siteAssetVersion = "20260809-layout-r2";
const privateRouteRoots = new Set([
  ".audit-backups",
  ".git",
  ".next",
  "app",
  "coverage",
  "data",
  "node_modules",
  "reports",
  "scripts",
  "tools"
]);
const privateRootFiles = new Set([
  "agents.md",
  "claude.md",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "plan.md",
  "product_ux_fix_report.md",
  "image_audit_before.md",
  "image_audit_after.md",
  "proxy.js",
  "readme.md",
  "server.ps1",
  "vercel.json"
]);

function withVersionedStylesheet(html) {
  let output = html.replace(/((?:\.\.\/|\/)?assets\/site\.css)(?:\?[^"']*)?(?=["'])/g, `$1?v=${siteAssetVersion}`);
  if (!/class=["'][^"']*skip-link/i.test(output)) output = output.replace(/<body([^>]*)>/i, `<body$1><a class="skip-link" href="#main-content">Skip to main content</a>`);
  if (!/<main\b[^>]*\bid=/i.test(output)) output = output.replace(/<main\b/i, '<main id="main-content"');
  return output;
}

function safePath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(/*turbopackIgnore: true*/ root, relative);
}

function isPrivateStaticPath(parts) {
  const first = String(parts[0] || "").toLowerCase();
  const requestPath = parts.join("/").toLowerCase();
  if (requestPath === "data/search-index.json") return false;
  if (privateRouteRoots.has(first) || first.startsWith(".")) return true;
  if (parts.length === 1 && (privateRootFiles.has(first) || first.startsWith("server-"))) return true;
  return false;
}

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".txt", "text/plain; charset=utf-8"]
]);

function contentType(pathname) {
  const dot = pathname.lastIndexOf(".");
  const ext = dot >= 0 ? pathname.slice(dot).toLowerCase() : ".html";
  return types.get(ext) || "application/octet-stream";
}

async function readRouteFile(parts) {
  const requestParts = parts.length ? parts : ["index.html"];
  const last = requestParts[requestParts.length - 1] || "";
  const htmlParts = last.includes(".") ? requestParts : [...requestParts, "index.html"];
  const filePath = safePath(htmlParts);
  if (!filePath) return null;
  try {
    return { body: await readFile(/*turbopackIgnore: true*/ filePath), filePath };
  } catch {
    return null;
  }
}

export async function GET(_request, context) {
  const params = await context.params;
  const parts = params.path || [];
  if (isPrivateStaticPath(parts)) {
    return new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex, nofollow" } });
  }
  if (!parts.length) {
    return Response.redirect(new URL("/en-za/", _request.url), 308);
  }
  if (parts.join("/") === "admin/dashboard") {
    return Response.redirect(new URL("/admin/", _request.url), 303);
  }
  if (parts.join("/") === "en-za/news") {
    return new Response(withVersionedStylesheet(await renderNewsList()), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300"
      }
    });
  }
  if (parts.join("/") === "en-za/news/feed.xml") {
    return new Response(await renderNewsFeed(), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    });
  }
  if (parts.join("/") === "en-za/blog") {
    return new Response(withVersionedStylesheet(await renderBlogList()), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300"
      }
    });
  }
  if (parts.join("/") === "en-za/blog/feed.xml") {
    return new Response(await renderBlogFeed(), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    });
  }
  if (parts.length === 3 && parts[0] === "en-za" && parts[1] === "blog") {
    const html = await renderBlogArticle(parts[2]);
    if (html) {
      return new Response(withVersionedStylesheet(html), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=0, s-maxage=300"
        }
      });
    }
  }
  if (parts.length === 3 && parts[0] === "en-za" && parts[1] === "news") {
    const html = await renderNewsArticle(parts[2]);
    if (html) {
      return new Response(withVersionedStylesheet(html), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=0, s-maxage=300"
        }
      });
    }
  }
  const file = await readRouteFile(parts);
  if (file) {
    const locale = String(parts[0] || "").toLowerCase();
    const isUnverifiedTranslation = ["af-za", "zu-za", "xh-za", "st-za", "tn-za"].includes(locale);
    const isIncompleteContent = /local prototype|prepared for deployment|pending production|verified translation is pending/i.test(file.body.toString("utf8"));
    const isHtml = contentType(file.filePath) === "text/html; charset=utf-8";
    const body = isHtml ? withVersionedStylesheet(file.body.toString("utf8")) : file.body;
    return new Response(body, {
      headers: {
        "content-type": contentType(file.filePath),
        "cache-control": "public, max-age=0, s-maxage=300",
        ...(locale ? { "content-language": locale } : {}),
        ...(isUnverifiedTranslation || isIncompleteContent ? { "x-robots-tag": "noindex, follow" } : {})
      }
    });
  }

  const notFound = await readRouteFile(["en-za", "404"]);
  return new Response(notFound?.body || "Not found", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

export async function POST(request, context) {
  const params = await context.params;
  const parts = params.path || [];
  if (parts.length) {
    return new Response(JSON.stringify({ code: 0, msg: "\u63a5\u53e3\u4e0d\u5b58\u5728" }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }
  const target = new URL("/api/webhook/send_article", request.url);
  const body = await request.text();
  return fetch(target, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/x-www-form-urlencoded"
    },
    body
  });
}
