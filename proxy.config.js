const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

// Explicit agent to handle JPL's internal certificate if needed
const agent = new https.Agent({ 
  rejectUnauthorized: false,
  keepAlive: true 
});

module.exports = {
  server: {
    baseDir: "./",
    middleware: [
      // 1. Merlin specific endpoints -> NASA Server
      createProxyMiddleware({
        pathFilter: (path) => 
          path.startsWith('/api/health') || 
          path.startsWith('/api/chat') || 
          path.startsWith('/api/query'),
        target: 'https://mentor0.jpl.nasa.gov:10443',
        secure: false,
        changeOrigin: true,
        xfwd: true,
        agent: agent,
        proxyTimeout: 60000,
        timeout: 60000,
        on: {
          proxyReq: (proxyReq, req, res) => {
            const targetHost = 'mentor0.jpl.nasa.gov:10443';
            proxyReq.setHeader('host', targetHost);
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [Proxy Merlin] ${req.method} ${req.url} -> https://${targetHost}${proxyReq.path}`);
          },
          error: (err, req, res) => {
            const timestamp = new Date().toLocaleTimeString();
            console.error(`[${timestamp}] [Proxy Merlin Error] ${req.url}:`, err.message);
          }
        }
      }),
      // 2. All other /api -> Local DAWGIE Backend
      createProxyMiddleware({
        pathFilter: '/api',
        target: 'https://localhost:8080',
        secure: false,
        changeOrigin: true,
        on: {
          proxyReq: (proxyReq, req, res) => {
            const host = proxyReq.getHeader('host') || 'localhost:8080';
            console.log(`[Proxy DAWGIE] ${req.method} ${req.url} -> https://${host}${proxyReq.path}`);
          }
        }
      })
    ]
  },
  files: ["*.html", "*.css", "*.js", "assets/**/*"],
  port: 3000,
  open: true
};