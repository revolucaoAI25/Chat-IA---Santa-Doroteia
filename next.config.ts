import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `unpdf`, `mammoth` and `exceljs` are CommonJS/Node-native parsers. Keeping them
  // external stops the bundler from trying to inline their worker assets.
  serverExternalPackages: ['unpdf', 'mammoth', 'exceljs'],
  experimental: {
    // Ingestion posts whole PDFs to a route handler.
    serverActions: { bodySizeLimit: '32mb' },
  },
};

export default nextConfig;
