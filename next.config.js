/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // CORS configuration for widget embedding
  async headers() {
    return [
      {
        source: '/widget.js',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET',
          },
        ],
      },
      {
        source: '/api/ask',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || 'https://www.bravoelectro.com',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;