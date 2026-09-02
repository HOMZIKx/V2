import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  transpilePackages: ['@v2/design-system'],
  async redirects() {
    return [{ source: '/', destination: '/aktywnosci', permanent: false }];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
