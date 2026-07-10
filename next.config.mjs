/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  async redirects() {
    return [
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
      {
        source: "/",
        destination: "/en-za/",
        permanent: true
      }
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
