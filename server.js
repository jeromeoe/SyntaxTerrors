// This file is now simplified to forward requests to the Flask backend
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// Set up proxy for all API requests to Flask backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api' // Keep the /api prefix
  },
  onProxyReq: (proxyReq, req, _res) => {
    console.log(`Proxying ${req.method} request to: ${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({
      message: 'Error connecting to backend service. Please ensure the Flask server is running.'
    });
  }
}));

// Handle all other routes - important for SPA with client-side routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Express server running at http://localhost:${PORT}`);
  console.log(`Proxying API requests to Flask backend at http://localhost:5000`);
});