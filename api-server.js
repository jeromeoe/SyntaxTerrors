import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { URL } from 'url';
import fs from 'fs-extra';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Only serve static files in production mode and if the dist directory exists
const distDir = join(__dirname, 'dist');
if (isProduction && fs.existsSync(distDir)) {
  console.log('Serving static files from:', distDir);
  app.use(express.static(distDir));
} else {
  console.log('Running in development mode or dist directory not found. Skipping static file serving.');
}

// Get JigsawStack API key from environment variables
const JIGSAWSTACK_API_KEY = process.env.VITE_JIGSAWSTACK_API_KEY || process.env.JIGSAWSTACK_API_KEY;
if (!JIGSAWSTACK_API_KEY) {
  console.warn('JIGSAWSTACK_API_KEY environment variable is not set. Using mock data only.');
}

// Helper Functions
function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

function normalizeScore(score, defaultValue = 50) {
  if (score === undefined || score === null || isNaN(Number(score))) {
    return defaultValue;
  }
  return Math.max(0, Math.min(100, Number(score)));
}

function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

function isValidUrl(url) {
  try {
    const result = new URL(url);
    return !!result.protocol && !!result.host;
  } catch {
    return false;
  }
}

function sanitizeInput(inputString) {
  if (typeof inputString !== 'string') {
    return "";
  }
  return inputString.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

function isProblematicDomain(url) {
  try {
    const domain = new URL(url).hostname;
    const problematicDomains = ['facebook.com', 'fb.com', 'instagram.com', 'tiktok.com'];
    return problematicDomains.some(prob => domain.includes(prob));
  } catch {
    return false;
  }
}

function generateMockData(url) {
  // Generate consistent mock data based on URL hash
  const urlHash = crypto.createHash('md5').update(url).digest('hex');
  
  return {
    scores: {
      dealPotential: parseInt(urlHash.substring(0, 2), 16) % 30 + 60,
      practicality: parseInt(urlHash.substring(2, 4), 16) % 30 + 60,
      difficulty: parseInt(urlHash.substring(4, 6), 16) % 30 + 60,
      revenue: parseInt(urlHash.substring(6, 8), 16) % 30 + 60,
      aiEase: parseInt(urlHash.substring(8, 10), 16) % 30 + 60
    },
    insights: [
      "Strong market presence in their industry",
      "Clear need for automation in their processes",
      "Potential budget available for implementation",
      "Technical team likely in place for integration"
    ],
    recommendations: [
      "Focus on ROI in initial pitch",
      "Highlight successful case studies similar to their industry",
      "Prepare technical implementation plan",
      "Schedule demo with their technical team"
    ]
  };
}

function calculateScores(scores) {
  const DEFAULT_SCORE = 50;
  
  // Extract and normalize scores
  const normalizedScores = {
    dealPotential: normalizeScore(scores.dealPotential, DEFAULT_SCORE),
    practicality: normalizeScore(scores.practicality, DEFAULT_SCORE),
    revenue: normalizeScore(scores.revenue, DEFAULT_SCORE),
    aiEase: normalizeScore(scores.aiEase, DEFAULT_SCORE),
    difficulty: normalizeScore(scores.difficulty, DEFAULT_SCORE)
  };
  
  // Define weights for each metric
  const weights = {
    dealPotential: 0.25,
    practicality: 0.20,
    revenue: 0.30,
    aiEase: 0.15,
    difficulty: 0.10
  };
  
  // Critical thresholds that trigger penalties
  const thresholds = {
    dealPotential: 50,
    revenue: 50
  };
  
  // Calculate the weighted score components
  const weightedScores = {
    dealPotential: normalizedScores.dealPotential * weights.dealPotential,
    practicality: normalizedScores.practicality * weights.practicality,
    revenue: normalizedScores.revenue * weights.revenue,
    aiEase: normalizedScores.aiEase * weights.aiEase,
    difficulty: (100 - normalizedScores.difficulty) * weights.difficulty
  };
  
  // Calculate raw total (before penalties)
  const rawTotal = Object.values(weightedScores).reduce((sum, score) => sum + score, 0);
  
  // Calculate penalties
  const penalties = [];
  
  // Check for critical metrics below thresholds
  for (const [metric, threshold] of Object.entries(thresholds)) {
    if (normalizedScores[metric] < threshold) {
      // Calculate penalty: 5% reduction for each 10 points below threshold
      const shortfall = threshold - normalizedScores[metric];
      const penaltyFactor = Math.ceil(shortfall / 10) * 0.05;
      const penaltyValue = rawTotal * penaltyFactor;
      
      penalties.push({
        metric,
        threshold,
        actual: normalizedScores[metric],
        penaltyFactor,
        penaltyValue
      });
    }
  }
  
  // Apply penalties to get final score
  const totalPenalty = penalties.reduce((sum, p) => sum + p.penaltyValue, 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(rawTotal - totalPenalty)));
  
  // Return comprehensive scoring object
  return {
    normalizedScores,
    weights,
    weightedScores,
    rawTotal,
    penalties,
    totalPenalty,
    totalScore: finalScore
  };
}

async function validateEmail(email) {
  // Basic validation first
  if (!isValidEmail(email)) {
    return {
      is_valid: false,
      error: "Invalid email format"
    };
  }
  
  try {
    // Check if API key is available
    if (!JIGSAWSTACK_API_KEY) {
      console.log('Using mock email validation (no API key)');
      // Return mock validation result
      return {
        is_valid: true,
        is_disposable: email.includes('temp') || email.includes('disposable'),
        is_role_account: email.startsWith('info') || email.startsWith('support'),
        has_mx_records: true,
        domain: email.split('@')[1]
      };
    }
    
    // Make API call to JigsawStack
    const response = await axios({
      method: 'get',
      url: 'https://api.jigsawstack.com/v1/email/validate',
      params: { email: sanitizeInput(email) },
      headers: {
        'x-api-key': JIGSAWSTACK_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    // Return validation result
    return response.data;
  } catch (error) {
    console.error('Email validation error:', error.message);
    
    // Return error result
    return {
      is_valid: false,
      error: `API request failed: ${error.message}`
    };
  }
}

// API Endpoints
app.get('/api/health-check', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

// Search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    // Validate the query parameter
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        message: 'Search query is required'
      });
    }
    
    // Sanitize the input
    const sanitizedQuery = sanitizeInput(query);
    
    // Check if API key is available
    if (!JIGSAWSTACK_API_KEY) {
      console.warn('No JigsawStack API key available for search endpoint');
      return res.status(422).json({
        message: 'Search service is not available. API key is missing.',
        status: 'service_unavailable'
      });
    }
    
    // Log the search request
    console.log(`Processing search request for query: "${sanitizedQuery}"`);
    
    // Make request to JigsawStack's web search API
    try {
      const response = await axios({
        method: 'get',
        url: 'https://api.jigsawstack.com/v1/web/search',
        params: { query: sanitizedQuery },
        headers: {
          'x-api-key': JIGSAWSTACK_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000 // 15 seconds timeout
      });
      
      // Log success
      console.log(`Search API response status: ${response.status}`);
      
      // Return the search results
      res.json(response.data);
    } catch (error) {
      console.error('Search API error:', error.message);
      
      // Log detailed error information
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received from search API');
      } else {
        console.error('Error setting up request:', error.message);
      }
      
      // Return error response with 422 status
      res.status(422).json({
        message: `Search failed: ${error.message}`,
        status: 'search_failed'
      });
    }
  } catch (error) {
    console.error('Error processing search request:', error);
    res.status(500).json({
      message: `An error occurred while processing search request: ${error.message}`,
      status: 'server_error'
    });
  }
});

app.post('/api/analyze-lead', async (req, res) => {
  try {
    const { url, email } = req.body;
    
    // Validate required fields
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }
    
    const sanitizedUrl = sanitizeInput(url);
    const sanitizedEmail = email ? sanitizeInput(email) : '';
    
    // Validate URL format
    if (!isValidUrl(sanitizedUrl)) {
      return res.status(400).json({ message: 'Invalid URL format' });
    }
    
    // Check for problematic domains
    if (isProblematicDomain(sanitizedUrl)) {
      const domain = new URL(sanitizedUrl).hostname;
      console.warn(`Request for known problematic domain: ${domain}`);
      return res.status(422).json({
        message: `This website (${domain}) cannot be analyzed due to access restrictions. Try a different URL.`,
        status: 'restricted_site',
        domain
      });
    }
    
    // Email validation step (if provided)
    let emailValidation = null;
    if (sanitizedEmail) {
      console.log(`Email provided: ${sanitizedEmail}. Beginning validation...`);
      emailValidation = await validateEmail(sanitizedEmail);
      
      // If email is not valid, return error
      if (!emailValidation.is_valid) {
        const errorMessage = emailValidation.error || 'Email validation failed';
        console.warn(`Email validation failed: ${errorMessage}`);
        
        return res.status(400).json({
          message: `Email validation failed: ${errorMessage}`,
          validationDetails: emailValidation
        });
      }
      
      console.log(`Email successfully validated: ${sanitizedEmail}`);
      
      // If email is disposable, log a warning but continue
      if (emailValidation.is_disposable) {
        console.warn(`Warning: ${sanitizedEmail} is a disposable email address`);
      }
    }
    
    // Proceed with website analysis
    console.log(`Analyzing URL: ${sanitizedUrl}`);
    
    let apiData;
    let usesMockData = false;
    
    try {
      // Check if API key is available
      if (!JIGSAWSTACK_API_KEY) {
        console.log('Using mock data (no API key)');
        apiData = generateMockData(sanitizedUrl);
        usesMockData = true;
      } else {
        // Call JigsawStack API
        const jigsawstackUrl = 'https://api.jigsawstack.com/v1/ai/web-scrape';
        
        const payload = {
          url: sanitizedUrl,
          extraction_prompt: 'Analyze the website for business lead qualification and provide scores for deal potential, practicality, difficulty, revenue potential, and AI integration ease. Each score should be between 0-100. Also provide insights about the business and recommendations for engagement.',
          options: {
            wait_for_selector: 'body',
            javascript: true,
            blocked_resource_types: ['image', 'media', 'font', 'stylesheet'],
            timeout: 15000 // 15 seconds timeout
          }
        };
        
        // If email was validated, include it in the request
        if (sanitizedEmail && emailValidation && emailValidation.is_valid) {
          payload.metadata = {
            email: sanitizedEmail,
            validationResult: emailValidation
          };
        }
        
        console.log(`Making request to JigsawStack API: ${jigsawstackUrl}`);
        
        const response = await axios({
          method: 'post',
          url: jigsawstackUrl,
          data: payload,
          headers: {
            'x-api-key': JIGSAWSTACK_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 20000 // 20 seconds timeout
        });
        
        console.log(`JigsawStack API response status: ${response.status}`);
        
        // Process the API response
        const apiResponse = response.data;
        console.log('JigsawStack API response received');
        
        // Validate response structure
        if (!apiResponse || typeof apiResponse !== 'object') {
          console.error('Invalid response structure from JigsawStack API');
          throw new Error('Invalid response from analysis service');
        }
        
        // Extract information from the API response
        const content = apiResponse.content || {};
        
        // Extract scores from response or generate reasonable defaults
        const scores = {
          dealPotential: content.deal_potential || 75,
          practicality: content.practicality || 70,
          difficulty: content.difficulty || 65,
          revenue: content.revenue_potential || 80,
          aiEase: content.ai_integration_ease || 70
        };
        
        // Verify scores are valid numbers
        for (const [key, value] of Object.entries(scores)) {
          if (typeof value !== 'number' || isNaN(value) || value < 0 || value > 100) {
            console.warn(`Invalid score for ${key}: ${value}, using default`);
            scores[key] = 70; // Default mid-range score
          }
        }
        
        // Extract insights and recommendations
        let insights = content.insights || [];
        if (!insights || !Array.isArray(insights) || insights.length === 0) {
          insights = ["Potential business opportunity detected", 
                     "Company appears to be in growth phase",
                     "Digital transformation likely underway"];
        }
        
        let recommendations = content.recommendations || [];
        if (!recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
          recommendations = ["Perform detailed needs assessment",
                           "Prepare tailored solution proposal",
                           "Identify key decision makers in the organization"];
        }
        
        apiData = {
          scores,
          insights,
          recommendations
        };
      }
    } catch (error) {
      console.error('JigsawStack API error:', error.message);
      
      // Generate fallback mock data
      console.log('Using mock data as fallback after API error');
      apiData = generateMockData(sanitizedUrl);
      usesMockData = true;
      
      // Log details about the error for diagnostics, but continue with mock data
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received from API');
      } else {
        console.error('Error setting up request:', error.message);
      }
    }
    
    // Calculate detailed scores
    const scoringDetails = calculateScores(apiData.scores);
    
    // Extract domain for company name
    let domain;
    try {
      domain = new URL(sanitizedUrl).hostname;
    } catch (error) {
      domain = sanitizedUrl;
    }
    const companyName = `Company from ${domain}`;
    
    // Prepare response data
    const responseData = {
      id: generateId(sanitizedUrl),
      url: sanitizedUrl,
      companyName,
      ...apiData.scores, // Include original scores
      ...scoringDetails.normalizedScores, // Include normalized scores
      totalScore: scoringDetails.totalScore,
      scoringDetails: {
        weights: scoringDetails.weights,
        penalties: scoringDetails.penalties,
        rawTotal: scoringDetails.rawTotal,
        totalPenalty: scoringDetails.totalPenalty
      },
      insights: apiData.insights,
      recommendations: apiData.recommendations,
      usesMockData: usesMockData // Indicate if mock data was used
    };
    
    // If email was provided and validated, include in response
    if (sanitizedEmail && emailValidation && emailValidation.is_valid) {
      responseData.email = {
        address: sanitizedEmail,
        validation: emailValidation
      };
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      message: `An error occurred while analyzing the lead: ${error.message}`,
      status: 'server_error'
    });
  }
});

// Only handle SPA routes in production mode
if (isProduction && fs.existsSync(join(distDir, 'index.html'))) {
  // Handle all other routes - important for SPA with client-side routing
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
} else {
  // In development, we just provide API endpoints
  app.get('*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found. In development mode, frontend is served by Vite.' });
  });
}

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`Mode: ${isProduction ? 'Production' : 'Development'}`);
});