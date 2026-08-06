import { NextResponse } from "next/server";

const fileLikePath = /(?:^|\/)[^/]+\.[^/]+$/;

export function proxy(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return NextResponse.next();

  const { pathname } = request.nextUrl;
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

  const url = request.nextUrl.clone();
  url.pathname = `${pathname}/`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/:path*"
};
