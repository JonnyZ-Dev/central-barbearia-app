/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["node:sqlite", "pino", "@whiskeysockets/baileys"],
};

export default nextConfig;
