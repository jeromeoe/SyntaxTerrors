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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

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
    // Launch a headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // Set a user agent to avoid being blocked
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set a timeout for navigation
    await page.setDefaultNavigationTimeout(15000);
    
    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Navigate to URL
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Wait for the body to ensure content is loaded
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Extract page information
    const pageData = await page.evaluate(() => {
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
    
    console.log(`Successfully scraped ${url} - ${pageData.wordCount} words`);
    return pageData;
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    throw new Error(`Failed to scrape website: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
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
      return res.status(400).json({ 
        message: 'URL is required',
        timestamp: new Date().toISOString()
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ 
        message: 'Invalid URL format',
        timestamp: new Date().toISOString()
      });
    }

    // Scrape the website
    let pageData;
    try {
      pageData = await scrapeWebsite(url);
    } catch (error) {
      console.error(`Scraping failed for ${url}:`, error);
      // Fall back to generating mock data
      pageData = {
        text: `Mock content for ${url}`,
        title: `${new URL(url).hostname} - Homepage`,
        metaDescription: "Auto-generated description due to scraping failure",
        headings: ["Welcome", "About Us", "Services"],
        wordCount: 500
      };
    }

    // Analyze the content
    const analysis = await mockLLMAnalysis(pageData, url);
    
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

    res.json(responseData);
  } catch (error) {
    console.error('Error processing request:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
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