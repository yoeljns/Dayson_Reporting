/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pg is server-only; keep it out of the client/edge bundle.
    serverComponentsExternalPackages: ["pg"],
    serverActions: {
      bodySizeLimit: "10mb", // Excel uploads
    },
  },
};

export default nextConfig;
