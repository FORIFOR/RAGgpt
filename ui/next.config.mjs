/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next.js 13+ App Router is default; remove deprecated appDir flag
  // Note: custom API routes under app/api handle proxying; global rewrites are disabled to avoid conflicts
  async redirects() {
    return [
      { source: '/notebook/new', destination: '/home', permanent: true },
      { source: '/notebook/:id', destination: '/n/:id', permanent: true },
    ];
  },
  async rewrites() { return []; },
  async headers() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
            { key: 'Pragma', value: 'no-cache' },
            { key: 'Expires', value: '0' },
          ],
        },
      ];
    }
    return [];
  },
  // Exclude Storybook files from production builds
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.module.rules.push({
        test: /\.stories\.tsx?$/,
        loader: 'ignore-loader',
      });
    }
    return config;
  },
};

export default nextConfig;
