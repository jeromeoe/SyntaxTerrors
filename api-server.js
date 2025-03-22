import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Enable CORS for development
app.use(cors());
app.use(express.json());

// Only serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
}

// Improved error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Ensure err is an object with properties
  const error = err instanceof Error ? err : new Error(String(err));
  
  // Provide more detailed error information
  const statusCode = error.statusCode || 500;
  const phase = error.phase || 'unknown';
  const errorTimestamp = new Date().toISOString();
  
  // Ensure we always set content-type to application/json
  res.setHeader('Content-Type', 'application/json');
  res.status(statusCode).json({ 
    message: error.message || 'Internal server error',
    errorType: error.name,
    phase: phase,
    timestamp: errorTimestamp,
    requestUrl: req.originalUrl,
    method: req.method,
    scrapingSuccess: false,
    ...(error.details && { details: error.details })
  });
});

// List of domains known to block scrapers or cause issues
const BLOCKED_DOMAINS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'reddit.com', 'linkedin.com', 'tiktok.com', 'pinterest.com',
  'netflix.com', 'amazon.com', 'youtube.com', 'google.com',
  'github.com', 'apple.com', 'walmart.com'
];

function isDomainBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

function getSeededRandom(seed, min = 0, max = 1) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  const normalizedValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  return normalizedValue * (max - min) + min;
}

/**
 * Scrape a website using Puppeteer
 * @param {string} url - The URL to scrape
 * @returns {Promise<{text: string, title: string, metaDescription: string, headings: string[], wordCount: number}>}
 */
async function scrapeWebsite(url) {
  console.log(`Starting scrape of ${url}`);
  let browser = null;
  
  try {
    // Check for blocked domains first
    if (isDomainBlocked(url)) {
      const error = new Error(`This website cannot be analyzed due to access restrictions. Sites like Facebook, Twitter, LinkedIn, and other major platforms block our analyzer.`);
      error.statusCode = 422;
      error.phase = 'domain-validation';
      throw error;
    }
    
    // Launch a headless browser with appropriate settings for Bolt environment
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    } catch (error) {
      console.error('Browser launch failed:', error);
      const enhancedError = new Error(`Failed to initialize browser for scraping: ${error.message}`);
      enhancedError.statusCode = 500;
      enhancedError.phase = 'browser-initialization';
      enhancedError.details = { originalError: error.message };
      throw enhancedError;
    }
    
    let page;
    try {
      page = await browser.newPage();
    } catch (error) {
      console.error('Failed to create new page:', error);
      const enhancedError = new Error(`Failed to create browser page: ${error.message}`);
      enhancedError.statusCode = 500;
      enhancedError.phase = 'page-creation';
      enhancedError.details = { originalError: error.message };
      throw enhancedError;
    }
    
    // Set a user agent to avoid being blocked
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set a timeout for navigation
    await page.setDefaultNavigationTimeout(15000);
    
    // Block unnecessary resources to speed up loading
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    } catch (error) {
      console.error('Failed to set request interception:', error);
      // Non-critical error, continue with scraping
    }
    
    // Navigate to URL with explicit timeout and waitUntil option
    let response;
    try {
      console.log(`Navigating to ${url}`);
      response = await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      
      if (!response) {
        throw new Error(`Page failed to load (status unknown) - The website did not return a response`);
      }
      
      const status = response.status();
      if (status >= 400) {
        throw new Error(`Page failed to load (HTTP status ${status}) - The website returned an error response`);
      }
    } catch (error) {
      console.error(`Navigation failed for ${url}:`, error);
      
      let message = 'Failed to navigate to the website';
      let statusCode = 500;
      
      // Provide specific error messages based on error type
      if (error.message.includes('Navigation timeout')) {
        message = "Page took too long to load (timeout after 15 seconds). The website is likely too slow or blocked our request.";
        statusCode = 504;
      } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        message = "Domain name could not be resolved. The website might not exist or DNS is misconfigured.";
        statusCode = 400;
      } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        message = "Connection refused by the website. The server might be down, blocking our requests, or not accepting connections.";
        statusCode = 502;
      } else if (error.message.includes('net::ERR_CONNECTION_RESET')) {
        message = "Connection was reset by the website. The server might have security measures that detected our scraper.";
        statusCode = 502;
      } else if (error.message.includes('net::ERR_CERT_')) {
        message = "SSL/TLS certificate issue. The website has an invalid or expired security certificate.";
        statusCode = 526;
      } else if (error.message.includes('Page failed to load')) {
        // Use the custom error message directly
        message = error.message;
        statusCode = 502;
      }
      
      const enhancedError = new Error(`Website navigation failed: ${message}`);
      enhancedError.statusCode = statusCode;
      enhancedError.phase = 'page-navigation';
      enhancedError.details = { 
        originalError: error.message,
        url: url,
        statusCode: response ? response.status() : 'unknown'
      };
      throw enhancedError;
    }
    
    // Wait for the body to ensure content is loaded
    try {
      await page.waitForSelector('body', { timeout: 10000 });
    } catch (error) {
      console.error(`Body selector not found for ${url}:`, error);
      const enhancedError = new Error(`Could not find page body: The website structure is unusual or it's not loading properly`);
      enhancedError.statusCode = 500;
      enhancedError.phase = 'content-waiting';
      enhancedError.details = { originalError: error.message };
      throw enhancedError;
    }
    
    // Extract page information with better error handling
    let pageData;
    try {
      pageData = await page.evaluate(() => {
        // Get all visible text
        const bodyText = document.body.innerText || '';
        
        // Get page title
        const title = document.title || '';
        
        // Get meta description
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        
        // Get headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText.trim());
        
        return {
          text: bodyText,
          title: title,
          metaDescription: metaDesc,
          headings: headings,
          wordCount: bodyText.split(/\s+/).length
        };
      });
    } catch (error) {
      console.error(`Page evaluation failed for ${url}:`, error);
      const enhancedError = new Error(`Failed to extract content from the website: ${error.message || 'JavaScript execution failed in the page context'}`);
      enhancedError.statusCode = 500;
      enhancedError.phase = 'content-extraction';
      enhancedError.details = { originalError: error.message };
      throw enhancedError;
    }
    
    // Check for insufficient content
    if (!pageData.text || pageData.text.length < 50) {
      const enhancedError = new Error(`Page loaded but content is too short or empty (${pageData.text ? pageData.text.length : 0} characters). We need at least 50 characters to analyze.`);
      enhancedError.statusCode = 422;
      enhancedError.phase = 'content-validation';
      enhancedError.details = { 
        contentLength: pageData.text ? pageData.text.length : 0,
        hasTitle: !!pageData.title,
        headingsCount: pageData.headings.length
      };
      throw enhancedError;
    }
    
    // Check for unstructured content
    if (!pageData.title && pageData.headings.length === 0) {
      const enhancedError = new Error("Unstructured or unsupportable webpage: Could not extract meaningful data (no title or headings found)");
      enhancedError.statusCode = 422;
      enhancedError.phase = 'content-validation';
      enhancedError.details = { 
        contentLength: pageData.text.length,
        hasTitle: false,
        headingsCount: 0
      };
      throw enhancedError;
    }
    
    console.log(`Successfully scraped ${url} - ${pageData.wordCount} words`);
    return pageData;
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // If the error already has our enhanced properties, just throw it
    if (error.statusCode && error.phase) {
      throw error;
    }
    
    // Customize error message based on error type
    let message = error.message || "Unknown error occurred during scraping";
    let statusCode = error.statusCode || 500;
    let phase = error.phase || 'unknown';
    
    if (message.includes('Navigation timeout')) {
      message = "Page took too long to load. The site may be down or very slow.";
      statusCode = 504;
      phase = 'page-navigation';
    } else if (message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      message = "Domain name could not be resolved. Please check the URL.";
      statusCode = 400;
      phase = 'url-validation';
    } else if (message.includes('net::ERR_CONNECTION_REFUSED')) {
      message = "Connection refused. The website server may be down.";
      statusCode = 502;
      phase = 'page-connection';
    } else if (message.includes('Protocol error')) {
      message = "Browser protocol error. The site may use unsupported features.";
      statusCode = 500;
      phase = 'browser-protocol';
    }
    
    // Create a custom error with status code and timestamp
    const enhancedError = new Error(`Scraping failed: ${message}`);
    enhancedError.statusCode = statusCode;
    enhancedError.phase = phase;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.details = {
      url: url,
      originalError: error.message
    };
    
    throw enhancedError;
  } finally {
    // Always close the browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
        console.log(`Browser closed for ${url}`);
      } catch (error) {
        console.error(`Error closing browser for ${url}:`, error);
      }
    }
  }
}

/**
 * Mock LLM analysis function
 * This simulates feeding the text into an LLM for analysis
 * In a real implementation, this would call an actual LLM API
 * @param {Object} pageData - The scraped page data
 * @param {string} url - The URL being analyzed
 * @returns {Promise<{scores: Object, insights: string[], recommendations: string[]}>}
 */
async function mockLLMAnalysis(pageData, url) {
  console.log(`Analyzing content from ${url} (${pageData.wordCount} words)`);
  
  try {
    // In a real implementation, you would send the text to an LLM API
    // For now, we'll generate deterministic scores based on the URL and content
    
    // Extract features from the page content to make this slightly more realistic
    const text = pageData.text.toLowerCase();
    const domain = new URL(url).hostname;
    
    // Base scores - we'll adjust these based on text content
    const baseScores = {
      dealPotential: Math.floor(getSeededRandom(`${domain}-deal`, 60, 90)),
      practicality: Math.floor(getSeededRandom(`${domain}-prac`, 55, 85)),
      difficulty: Math.floor(getSeededRandom(`${domain}-diff`, 40, 80)),
      revenue: Math.floor(getSeededRandom(`${domain}-rev`, 65, 90)),
      aiEase: Math.floor(getSeededRandom(`${domain}-ai`, 60, 85)),
    };
    
    // Adjust scores based on text content (simple keyword analysis)
    const keywordAdjustments = {
      dealPotential: {
        'enterprise': 5,
        'business': 3, 
        'solution': 3,
        'partner': 4,
        'service': 2
      },
      practicality: {
        'easy': 5,
        'simple': 4,
        'integration': 5,
        'api': 3,
        'documentation': 4
      },
      difficulty: {
        'complex': 5,
        'advanced': 4,
        'enterprise': 3,
        'custom': 4
      },
      revenue: {
        'pricing': -3,
        'free': -5,
        'premium': 5,
        'enterprise': 7,
        'subscription': 4
      },
      aiEase: {
        'api': 5,
        'integration': 4,
        'data': 3,
        'automation': 5,
        'intelligence': 4
      }
    };
    
    // Apply adjustments based on content
    const scores = { ...baseScores };
    for (const [metric, keywords] of Object.entries(keywordAdjustments)) {
      for (const [keyword, adjustment] of Object.entries(keywords)) {
        // Count occurrences and apply adjustment (capped)
        const occurrences = (text.match(new RegExp(keyword, 'gi')) || []).length;
        if (occurrences > 0) {
          const totalAdjustment = Math.min(adjustment * Math.min(occurrences, 3), 15);
          scores[metric] = Math.min(Math.max(scores[metric] + totalAdjustment, 0), 100);
        }
      }
    }
    
    // Generate insights based on the content
    const insights = generateInsights(url, scores, pageData);
    
    // Generate recommendations
    const recommendations = generateRecommendations(url, scores, pageData);
    
    return {
      scores,
      insights,
      recommendations
    };
  } catch (error) {
    console.error(`Error in LLM analysis for ${url}:`, error);
    const enhancedError = new Error(`Content analysis failed: ${error.message || 'Unable to process the extracted website content'}`);
    enhancedError.statusCode = 500;
    enhancedError.phase = 'content-analysis';
    enhancedError.details = { originalError: error.message };
    throw enhancedError;
  }
}

function generateInsights(url, scores, pageData) {
  const domain = new URL(url).hostname;
  const insights = [
    `${domain} shows potential for automation in multiple areas`,
    `Business appears to be in the ${scores.dealPotential > 80 ? 'enterprise' : 'mid-market'} segment`,
    `Website has approximately ${pageData.wordCount} words of content`,
  ];

  // Add content-based insights
  if (pageData.headings.length > 0) {
    insights.push(`Key topics include: ${pageData.headings.slice(0, 3).join(', ')}`);
  }

  if (scores.revenue > 85) {
    insights.push('High revenue potential indicates budget availability for solutions');
  }
  
  if (scores.difficulty < 60) {
    insights.push('Implementation complexity is manageable with current technology stack');
  }

  return insights;
}

function generateRecommendations(url, scores, pageData) {
  const recommendations = [
    `Prepare a tailored proposal highlighting ${scores.dealPotential > 80 ? 'ROI' : 'growth potential'}`,
    'Schedule an initial discovery call to identify specific pain points',
    'Develop a phased implementation plan to manage complexity'
  ];

  if (scores.aiEase > 75) {
    recommendations.push('Highlight AI automation capabilities in the proposal');
  }
  
  if (scores.practicality < 70) {
    recommendations.push('Consider a proof-of-concept to address implementation concerns');
  }

  // Add recommendations based on page content
  const text = pageData.text.toLowerCase();
  if (text.includes('integration') || text.includes('api')) {
    recommendations.push('Emphasize our API integration capabilities in the proposal');
  }

  return recommendations;
}

function generatePageInfo(url, pageData) {
  return {
    title: pageData.title,
    description: pageData.metaDescription,
    headingsCount: pageData.headings.length,
    textLength: pageData.wordCount,
    extractTime: new Date().toISOString()
  };
}

// API Routes
app.post('/api/local-scrape', async (req, res, next) => {
  try {
    console.log('Received analysis request:', {
      url: req.body.url,
      timestamp: new Date().toISOString(),
      headers: req.headers
    });

    const { url } = req.body;
    
    if (!url) {
      // Ensure proper JSON response for validation errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ 
        message: 'URL is required',
        phase: 'input-validation',
        timestamp: new Date().toISOString(),
        scrapingSuccess: false
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      // Ensure proper JSON response for URL validation errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ 
        message: 'Invalid URL format. Please provide a complete URL (e.g., https://example.com)',
        phase: 'url-validation',
        timestamp: new Date().toISOString(),
        scrapingSuccess: false
      });
    }

    // Scrape the website
    let pageData;
    try {
      pageData = await scrapeWebsite(url);
    } catch (error) {
      console.error(`Scraping failed for ${url}:`, {
        message: error.message, 
        statusCode: error.statusCode || 500,
        phase: error.phase || 'unknown',
        timestamp: new Date().toISOString(),
        details: error.details || {}
      });
      
      // Ensure proper JSON response for scraping errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(error.statusCode || 500).json({ 
        message: `Website analysis failed: ${error.message || 'An unknown error occurred'}`,
        errorType: error.name || 'ScrapingError',
        phase: error.phase || 'website-scraping',
        timestamp: error.timestamp || new Date().toISOString(),
        url: url,
        scrapingSuccess: false,
        ...(error.details && { details: error.details })
      });
    }

    // Analyze the content
    let analysis;
    try {
      analysis = await mockLLMAnalysis(pageData, url);
    } catch (error) {
      console.error(`Analysis failed for ${url}:`, {
        message: error.message,
        statusCode: error.statusCode || 500,
        phase: error.phase || 'unknown',
        timestamp: new Date().toISOString(),
        details: error.details || {}
      });
      
      // Ensure proper JSON response for analysis errors
      res.setHeader('Content-Type', 'application/json');
      return res.status(error.statusCode || 500).json({
        message: `Website analysis failed: ${error.message || 'Content analysis failed'}`,
        errorType: error.name || 'AnalysisError',
        phase: error.phase || 'content-analysis',
        timestamp: error.timestamp || new Date().toISOString(),
        url: url,
        scrapingSuccess: true,
        analysisSuccess: false,
        ...(error.details && { details: error.details })
      });
    }
    
    // Calculate total score
    const totalScore = calculateTotalScore(analysis.scores);
    
    // Extract domain for company name
    const domain = new URL(url).hostname;
    const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

    const responseData = {
      id: generateId(url),
      url,
      companyName: `${companyName} ${domain.includes('.com') ? 'Inc.' : 'LLC'}`,
      ...analysis.scores,
      totalScore,
      insights: analysis.insights,
      recommendations: analysis.recommendations,
      isLocalAnalysis: true,
      pageInfo: generatePageInfo(url, pageData),
      scrapingSuccess: true,
      analysisSuccess: true,
      scoringDetails: {
        weights: {
          dealPotential: 0.25,
          practicality: 0.2,
          revenue: 0.3,
          aiEase: 0.15,
          difficulty: 0.1
        },
        penalties: [],
        rawTotal: totalScore,
        totalPenalty: 0
      }
    };

    console.log('Analysis completed successfully:', {
      url,
      id: responseData.id,
      totalScore: responseData.totalScore,
      timestamp: new Date().toISOString()
    });

    // Ensure proper JSON response for successful analysis
    res.setHeader('Content-Type', 'application/json');
    res.json(responseData);
  } catch (error) {
    console.error('Error processing request:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Pass any unhandled errors to the error handling middleware
    next(error);
  }
});

function calculateTotalScore(scores) {
  const weights = {
    dealPotential: 0.25,
    practicality: 0.2,
    revenue: 0.3,
    aiEase: 0.15,
    difficulty: 0.1,
  };

  return Math.round(
    scores.dealPotential * weights.dealPotential +
    scores.practicality * weights.practicality +
    scores.revenue * weights.revenue +
    scores.aiEase * weights.aiEase +
    (100 - scores.difficulty) * weights.difficulty
  );
}

// Health check endpoint
app.get('/api/health-check', (req, res) => {
  // Ensure proper JSON response for health check
  res.setHeader('Content-Type', 'application/json');
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running at http://localhost:${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});