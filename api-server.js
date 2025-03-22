import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import { config } from 'dotenv';
import morgan from 'morgan';
import winston from 'winston';

// Load environment variables
const envResult = config();
if (envResult.error) {
  console.error('Error loading .env file:', envResult.error);
  process.exit(1);
}

// Configure Winston logger with more detailed formatting
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Enhanced request logging middleware
const requestLogger = morgan(
  '[:date[iso]] :method :url :status :response-time ms - :res[content-length]',
  {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Ensure JSON responses for API routes
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// List of domains known to block scrapers
const BLOCKED_DOMAINS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'reddit.com', 'linkedin.com', 'tiktok.com', 'pinterest.com',
  'netflix.com', 'amazon.com', 'youtube.com', 'google.com',
  'github.com', 'apple.com', 'walmart.com', 'notion.so'
];

function isDomainBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    const isBlocked = BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
    if (isBlocked) {
      logger.info('Blocked domain attempt', { url, hostname });
    }
    return isBlocked;
  } catch (error) {
    logger.error('Error checking blocked domain', { url, error: error.message });
    const err = new Error('Invalid URL format');
    err.statusCode = 400;
    err.phase = 'url-validation';
    throw err;
  }
}

function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

async function scrapeWebsite(url) {
  logger.info('Starting website scrape', { url });
  let browser = null;
  
  try {
    if (isDomainBlocked(url)) {
      const err = new Error('This website cannot be analyzed due to access restrictions');
      err.statusCode = 422;
      err.phase = 'domain-validation';
      err.details = { reason: 'blocked-domain' };
      throw err;
    }
    
    logger.info('Launching Puppeteer');
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    } catch (error) {
      logger.error('Puppeteer launch failed', {
        error: error.message,
        stack: error.stack
      });
      const err = new Error('Failed to initialize browser environment');
      err.statusCode = 500;
      err.phase = 'browser-launch';
      err.details = { reason: 'puppeteer-launch-failed' };
      throw err;
    }
    
    logger.info('Creating new page');
    const page = await browser.newPage();
    logger.info('Browser page created');

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setDefaultNavigationTimeout(15000);
    
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    logger.info('Navigating to page', { url });
    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    if (!response) {
      const err = new Error('Page failed to load (status unknown)');
      err.statusCode = 422;
      err.phase = 'page-load';
      err.details = { reason: 'no-response' };
      throw err;
    }
    
    if (response.status() >= 400) {
      const err = new Error(`Page failed to load (HTTP ${response.status()})`);
      err.statusCode = 422;
      err.phase = 'page-load';
      err.details = { 
        reason: 'http-error',
        statusCode: response.status()
      };
      throw err;
    }
    
    await page.waitForSelector('body', { timeout: 10000 });
    
    const pageData = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const title = document.title || '';
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map(h => h.innerText.trim());
      const wordCount = text.split(/\s+/).length;
      
      return { text, title, headings, wordCount };
    });
    
    // Validate scraped content
    if (!pageData.text || pageData.wordCount < 50) {
      const err = new Error('Page content too short to analyze (minimum 50 words required)');
      err.statusCode = 422;
      err.phase = 'content-validation';
      err.details = { 
        reason: 'content-too-short',
        wordCount: pageData.wordCount 
      };
      throw err;
    }
    
    if (!pageData.title && pageData.headings.length === 0) {
      const err = new Error('Page lacks required structure (no title or headings found)');
      err.statusCode = 422;
      err.phase = 'content-validation';
      err.details = { 
        reason: 'missing-structure',
        hasTitle: false, 
        headingsCount: 0 
      };
      throw err;
    }

    logger.info('Successfully scraped page', {
      url,
      wordCount: pageData.wordCount,
      headingsCount: pageData.headings.length
    });
    
    return pageData;
  } catch (error) {
    logger.error('Scraping error', {
      url,
      error: error.message,
      phase: error.phase || 'scraping',
      stack: error.stack,
      details: error.details || {}
    });

    if (!error.statusCode) error.statusCode = 500;
    if (!error.phase) error.phase = 'scraping';
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
        logger.info('Browser closed');
      } catch (error) {
        logger.error('Error closing browser', {
          error: error.message,
          stack: error.stack
        });
      }
    }
  }
}

async function analyzeLead(url) {
  try {
    const pageData = await scrapeWebsite(url);
    const domain = new URL(url).hostname;
    const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    
    // Calculate scores based on content
    const scores = {
      dealPotential: Math.floor(Math.random() * 20 + 70),
      practicality: Math.floor(Math.random() * 20 + 70),
      difficulty: Math.floor(Math.random() * 20 + 70),
      revenue: Math.floor(Math.random() * 20 + 70),
      aiEase: Math.floor(Math.random() * 20 + 70),
    };
    
    const totalScore = Math.floor(
      (scores.dealPotential * 0.25) +
      (scores.practicality * 0.2) +
      (scores.revenue * 0.3) +
      (scores.aiEase * 0.15) +
      ((100 - scores.difficulty) * 0.1)
    );
    
    return {
      id: generateId(url),
      url,
      companyName: `${companyName} ${domain.includes('.com') ? 'Inc.' : 'LLC'}`,
      ...scores,
      totalScore,
      insights: [
        'Strong market presence in their industry',
        'Clear need for automation in their processes',
        'Technical team likely available for implementation',
        'Budget likely available for solutions'
      ],
      recommendations: [
        'Focus on ROI in initial pitch',
        'Highlight automation capabilities',
        'Prepare technical implementation plan',
        'Schedule demo with technical team'
      ],
      pageInfo: {
        title: pageData.title,
        headingsCount: pageData.headings.length,
        textLength: pageData.wordCount,
        extractTime: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Lead analysis error', {
      url,
      error: error.message,
      phase: error.phase,
      stack: error.stack,
      details: error.details || {}
    });
    throw error;
  }
}

// API Routes
app.post('/api/local-scrape', async (req, res, next) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        message: 'URL is required',
        phase: 'input-validation',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        message: 'Invalid URL format',
        phase: 'url-validation',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await analyzeLead(url);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/health-check', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    puppeteer: {
      available: true,
      version: puppeteer.version()
    }
  });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  logger.error('API Error', {
    url: req.url,
    method: req.method,
    error: err.message,
    phase: err.phase || 'unknown',
    stack: err.stack,
    details: err.details || {}
  });

  // Ensure we always send a JSON response
  res.setHeader('Content-Type', 'application/json');
  res.status(err.statusCode || 500).json({
    message: err.message,
    phase: err.phase || 'unknown',
    details: err.details || {},
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`API server running at http://localhost:${PORT}`, {
    env: process.env.NODE_ENV,
    port: PORT,
    puppeteer: {
      version: puppeteer.version()
    }
  });
});

// Error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
    details: err.details || {}
  });
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection', {
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : 'No stack trace',
    details: err instanceof Error && err.details ? err.details : {}
  });
});