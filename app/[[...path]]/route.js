import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { renderBlogArticle, renderBlogFeed, renderBlogList } from "../lib/blog-renderer.js";
import { renderNewsArticle, renderNewsFeed, renderNewsList } from "../lib/news-renderer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const root = /*turbopackIgnore: true*/ process.cwd();

function safePath(parts) {
  const relative = normalize(join(...parts.filter(Boolean)));
  if (relative.startsWith("..") || relative.includes(`..${sep}`)) return null;
  return join(root, relative);
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
    return { body: await readFile(filePath), filePath };
  } catch {
    return null;
  }
}

export async function GET(_request, context) {
  const params = await context.params;
  const parts = params.path || [];
  if (parts.join("/") === "admin/dashboard") {
    return Response.redirect(new URL("/admin/", _request.url), 303);
  }
  if (parts.join("/") === "en-za/news") {
    return new Response(await renderNewsList(), {
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
    return new Response(await renderBlogList(), {
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
      return new Response(html, {
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
      return new Response(html, {
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
    return new Response(file.body, {
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
