import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api.js';
import { db } from './db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from public/
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir));

// Serve static screenshots & outputs directory from outputs/
const outputsDir = path.resolve(process.cwd(), 'outputs');
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}
app.use('/outputs', express.static(outputsDir));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' }
});

app.use('/api/', apiLimiter);

// Bind API routes
app.use('/api/v1', apiRouter);

// Serve index.html for root navigation
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.url} not found` });
});

// Fallback to SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message || 'An unexpected error occurred' });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 EOCheck API & Web Dashboard running on port ${PORT}`);
  console.log(`🌐 Target domain: https://eocheck.eoxia.com`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`==================================================`);
});

export default app;
