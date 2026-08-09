import { NextResponse } from "next/server";

const fileLikePath = /(?:^|\/)[^/]+\.[^/]+$/;

export function proxy(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return NextResponse.next();

  const pathname = new URL(request.url).pathname;
  if (
    pathname === "/" ||
    pathname.endsWith("/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/.well-known/") ||
    fileLikePath.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Use a raw URL instead of mutating request.nextUrl. This keeps the slash in
  // the Location header for dynamic static-file routes such as /en-za.
  return NextResponse.redirect(new URL(`${pathname}/`, request.url), 308);
}

export const config = { matcher: "/:path*" };
