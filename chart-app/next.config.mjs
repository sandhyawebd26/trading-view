/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  reactStrictMode: false, // the chart widget owns the DOM; double-mounting it in dev only causes flicker
}
export default nextConfig
