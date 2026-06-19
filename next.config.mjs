/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
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
