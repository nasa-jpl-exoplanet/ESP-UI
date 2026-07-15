const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

// Explicit agent to handle JPL's internal certificate if needed
const agent = new https.Agent({ 
  rejectUnauthorized: false,
  keepAlive: true 
});

const MERLIN_TARGET = process.env.MERLIN_TARGET || 'https://excalibur.jpl.nasa.gov:10443';
const DAWGIE_TARGET = process.env.DAWGIE_TARGET || 'https://localhost:8080';

// Extract hosts for header injection
const merlinHost = new URL(MERLIN_TARGET).host;
const dawgieHost = new URL(DAWGIE_TARGET).host;

console.log(`[Proxy Config] Merlin target: ${MERLIN_TARGET}`);
console.log(`[Proxy Config] DAWGIE target: ${DAWGIE_TARGET}`);

module.exports = {
  server: {
    baseDir: "./",
    middleware: [
      // 0. Configuration endpoint for the UI to discover targets
      (req, res, next) => {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (parsedUrl.pathname === '/api/config') {
          console.log(`[Proxy Config] Serving /api/config request`);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            merlinTarget: MERLIN_TARGET,
            dawgieTarget: DAWGIE_TARGET
          }));
        } else {
          next();
        }
      },
      // 1. Merlin specific endpoints -> NASA Server
      createProxyMiddleware({
        pathFilter: (path) => 
          path.startsWith('/api/health') || 
          path.startsWith('/api/chat') || 
          path.startsWith('/api/query'),
        target: MERLIN_TARGET,
        secure: false,
        changeOrigin: true,
        xfwd: true,
        agent: agent,
        proxyTimeout: 60000,
        timeout: 60000,
        on: {
          proxyReq: (proxyReq, req, res) => {
            proxyReq.setHeader('host', merlinHost);
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [Proxy Merlin] ${req.method} ${req.url} -> ${MERLIN_TARGET}${proxyReq.path}`);
          },
          error: (err, req, res) => {
            const timestamp = new Date().toLocaleTimeString();
            console.error(`[${timestamp}] [Proxy Merlin Error] ${req.url}:`, err.message);
          }
        }
      }),
      // 2. All other /api -> DAWGIE Backend
      createProxyMiddleware({
        pathFilter: '/api',
        target: DAWGIE_TARGET,
        secure: false,
        changeOrigin: true,
        on: {
          proxyReq: (proxyReq, req, res) => {
            proxyReq.setHeader('host', dawgieHost);
            console.log(`[Proxy DAWGIE] ${req.method} ${req.url} -> ${DAWGIE_TARGET}${proxyReq.path}`);
          }
        }
      })
    ]
  },
  files: ["*.html", "*.css", "*.js", "assets/**/*"],
  port: process.env.PORT || 3000,
  open: process.env.BS_OPEN !== 'false',
  ghostMode: false
};