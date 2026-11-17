/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Slim self-contained server for Node hosts (Render, Docker, VPS).
  output: "standalone"
};

module.exports = nextConfig;
