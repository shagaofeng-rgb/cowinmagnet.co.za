import legacyProductRedirects from "./data/seo/legacy-product-redirects.json" with { type: "json" };

const productRouteLocales = ["af-za", "xh-za", "zu-za"];
const nextRedirects = legacyProductRedirects.map(({ source, destination, permanent }) => ({ source, destination, permanent }));
const localeProductRedirects = productRouteLocales.flatMap((locale) =>
  nextRedirects.map((redirect) => ({
    ...redirect,
    source: redirect.source.replace("/en-za/", `/${locale}/`),
    destination: redirect.destination.replace("/en-za/", `/${locale}/`)
  }))
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  skipProxyUrlNormalize: true,
  poweredByHeader: false,
  // The admin shell is served through the dynamic route and reads these files at runtime.
  // Include them explicitly so Vercel's output tracing ships the CSS and application script.
  outputFileTracingIncludes: {
    "/*": ["./admin/**/*"]
  },
  async redirects() {
    return [
      ...nextRedirects,
      ...localeProductRedirects,
      {
        source: "/",
        has: [{ type: "host", value: "www.cowinmagnet.co.za" }],
        destination: "https://cowinmagnet.co.za/en-za/",
        permanent: true
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cowinmagnet.co.za" }],
        destination: "https://cowinmagnet.co.za/:path*/",
        permanent: true
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  }
};

export default nextConfig;
