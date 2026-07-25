import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api.js';
import { db } from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' }
});

app.use('/api/', apiLimiter);

// Bind API routes
app.use('/api/v1', apiRouter);

// Home route / Web Landing
app.get('/', (req, res) => {
  res.json({
    name: 'EOCheck API Service',
    description: 'API & Scanner Manager for eocheck.eoxia.com',
    version: '1.0.0',
    documentation: '/api/v1/health',
    status: 'online'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.url} not found` });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message || 'An unexpected error occurred' });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 EOCheck API Server running on port ${PORT}`);
  console.log(`🌐 Target domain: https://eocheck.eoxia.com`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`==================================================`);
});

export default app;
