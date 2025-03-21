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
        // Call JigsawStack API using the ai_scrape method with element_prompts
        console.log('Using JigsawStack AI Scraper with element_prompts');
        
        const response = await axios({
          method: 'post',
          url: 'https://api.jigsawstack.com/v1/ai/web/scrape',
          data: {
            url: sanitizedUrl,
            element_prompts: [
              "business_type",
              "company_size",
              "technologies_used",
              "revenue_indicators",
              "automation_opportunities",
              "pain_points",
              "contact_information"
            ],
            options: {
              wait_for_selector: 'body',
              javascript: true,
              blocked_resource_types: ['image', 'media', 'font'],
              timeout: 15000
            }
          },
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
        
        // Extract information from the API response and map to our lead data structure
        const data = apiResponse.elements || {};
        
        // Map the scraped data to our scoring metrics
        const dealPotential = calculateDealPotential(data);
        const practicality = calculatePracticality(data);
        const difficulty = calculateDifficulty(data);
        const revenue = calculateRevenue(data);
        const aiEase = calculateAIEase(data);
        
        // Generate insights from the data
        const insights = generateInsights(data);
        
        // Generate recommendations from the data
        const recommendations = generateRecommendations(data);
        
        apiData = {
          scores: {
            dealPotential,
            practicality,
            difficulty,
            revenue,
            aiEase
          },
          insights,
          recommendations,
          rawData: data
        };
      }
    } catch (error) {
      console.error('JigsawStack API error:', error.message);
      
      // Try fallback to traditional web scrape if element_prompts approach failed
      try {
        console.log('Trying fallback to traditional web-scrape method');
        const response = await axios({
          method: 'post',
          url: 'https://api.jigsawstack.com/v1/ai/web-scrape',
          data: {
            url: sanitizedUrl,
            extraction_prompt: 'Analyze the website for business lead qualification and provide scores for deal potential, practicality, difficulty, revenue potential, and AI integration ease. Each score should be between 0-100. Also provide insights about the business and recommendations for engagement.',
            options: {
              wait_for_selector: 'body',
              javascript: true,
              blocked_resource_types: ['image', 'media', 'font', 'stylesheet'],
              timeout: 15000 // 15 seconds timeout
            }
          },
          headers: {
            'x-api-key': JIGSAWSTACK_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 20000 // 20 seconds timeout
        });
        
        console.log(`Fallback API response status: ${response.status}`);
        
        // Process the API response
        const apiResponse = response.data;
        console.log('Fallback API response received');
        
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
      } catch (fallbackError) {
        console.error('Fallback API error:', fallbackError.message);
        
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

// Helper functions for calculating scores from element_prompts data
function calculateDealPotential(data) {
  // Default score if we can't calculate
  const defaultScore = 70;
  
  try {
    // Combine signals from business_type, company_size, and pain_points
    let score = defaultScore;
    
    const businessType = data.business_type || {};
    const companySize = data.company_size || {};
    const painPoints = data.pain_points || {};
    
    // Business type signals - B2B typically higher potential than B2C
    if (typeof businessType.value === 'string') {
      const btValue = businessType.value.toLowerCase();
      if (btValue.includes('b2b') || btValue.includes('enterprise')) {
        score += 10;
      } else if (btValue.includes('saas') || btValue.includes('software')) {
        score += 8;
      } else if (btValue.includes('ecommerce') || btValue.includes('retail')) {
        score += 5;
      }
    }
    
    // Company size signals - larger companies typically have higher deal potential
    if (typeof companySize.value === 'string') {
      const csValue = companySize.value.toLowerCase();
      if (csValue.includes('enterprise') || csValue.includes('large')) {
        score += 10;
      } else if (csValue.includes('medium') || csValue.includes('growing')) {
        score += 5;
      } else if (csValue.includes('startup') || csValue.includes('small')) {
        score -= 5;
      }
    }
    
    // Pain points signals - more pain points typically mean higher deal potential
    if (typeof painPoints.value === 'string') {
      const ppValue = painPoints.value.toLowerCase();
      // Count the number of distinct pain points mentioned
      const painPointCount = (ppValue.match(/,/g) || []).length + 1;
      
      if (painPointCount > 3) {
        score += 10;
      } else if (painPointCount > 1) {
        score += 5;
      }
      
      // Check for specific high-value pain points
      if (ppValue.includes('efficiency') || ppValue.includes('productivity')) {
        score += 5;
      }
      if (ppValue.includes('cost') || ppValue.includes('expensive')) {
        score += 5;
      }
      if (ppValue.includes('manual') || ppValue.includes('time-consuming')) {
        score += 5;
      }
    }
    
    // Ensure the score is within bounds
    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error calculating deal potential:', error);
    return defaultScore;
  }
}

function calculatePracticality(data) {
  const defaultScore = 70;
  
  try {
    // Base practicality score
    let score = defaultScore;
    
    const technologiesUsed = data.technologies_used || {};
    const painPoints = data.pain_points || {};
    
    // Technologies used signal - tech-savvy companies are usually easier to work with
    if (typeof technologiesUsed.value === 'string') {
      const techValue = technologiesUsed.value.toLowerCase();
      
      // Count the number of technologies mentioned
      const techCount = (techValue.match(/,/g) || []).length + 1;
      
      if (techCount > 5) {
        score += 10; // Tech-heavy companies are more practical to implement for
      } else if (techCount > 2) {
        score += 5;
      }
      
      // Check for modern technologies that indicate better practicality
      if (techValue.includes('api') || techValue.includes('rest')) {
        score += 8;
      }
      if (techValue.includes('cloud') || techValue.includes('aws') || 
          techValue.includes('azure') || techValue.includes('google cloud')) {
        score += 8;
      }
      if (techValue.includes('saas') || techValue.includes('software as a service')) {
        score += 5;
      }
    }
    
    // Pain points can affect practicality
    if (typeof painPoints.value === 'string') {
      const ppValue = painPoints.value.toLowerCase();
      
      // Check for pain points that suggest easy implementation
      if (ppValue.includes('integration') || ppValue.includes('connect')) {
        score -= 5; // Integration challenges lower practicality
      }
      if (ppValue.includes('legacy') || ppValue.includes('old system')) {
        score -= 10; // Legacy systems make implementation less practical
      }
      if (ppValue.includes('simple') || ppValue.includes('straightforward')) {
        score += 5; // Simple needs increase practicality
      }
    }
    
    // Ensure the score is within bounds
    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error calculating practicality:', error);
    return defaultScore;
  }
}

function calculateDifficulty(data) {
  const defaultScore = 65;
  
  try {
    // Base difficulty score
    let score = defaultScore;
    
    const technologiesUsed = data.technologies_used || {};
    const businessType = data.business_type || {};
    const companySize = data.company_size || {};
    
    // Technologies used - more complex tech stack means higher difficulty
    if (typeof technologiesUsed.value === 'string') {
      const techValue = technologiesUsed.value.toLowerCase();
      
      // Count unique technologies
      const techCount = (techValue.match(/,/g) || []).length + 1;
      
      if (techCount > 5) {
        score += 10; // Complex tech stack increases difficulty
      }
      
      // Legacy technologies increase difficulty
      if (techValue.includes('legacy') || techValue.includes('mainframe')) {
        score += 15;
      }
      
      // Modern technologies may decrease difficulty
      if (techValue.includes('api') || techValue.includes('rest')) {
        score -= 5;
      }
      if (techValue.includes('microservices') || techValue.includes('modular')) {
        score -= 5;
      }
    }
    
    // Business type can affect difficulty
    if (typeof businessType.value === 'string') {
      const btValue = businessType.value.toLowerCase();
      
      // Regulated industries tend to be more difficult
      if (btValue.includes('healthcare') || btValue.includes('finance') || 
          btValue.includes('banking') || btValue.includes('insurance')) {
        score += 10;
      }
      
      // B2C implementations tend to be simpler than B2B
      if (btValue.includes('b2c') || btValue.includes('consumer')) {
        score -= 5;
      }
    }
    
    // Company size affects complexity
    if (typeof companySize.value === 'string') {
      const csValue = companySize.value.toLowerCase();
      
      if (csValue.includes('enterprise') || csValue.includes('large')) {
        score += 10; // Larger companies typically have more complex requirements
      } else if (csValue.includes('small') || csValue.includes('startup')) {
        score -= 10; // Smaller companies tend to be more nimble
      }
    }
    
    // Ensure the score is within bounds
    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error calculating difficulty:', error);
    return defaultScore;
  }
}

function calculateRevenue(data) {
  const defaultScore = 70;
  
  try {
    // Base revenue score
    let score = defaultScore;
    
    const companySize = data.company_size || {};
    const businessType = data.business_type || {};
    const revenueIndicators = data.revenue_indicators || {};
    
    // Company size is a primary revenue factor
    if (typeof companySize.value === 'string') {
      const csValue = companySize.value.toLowerCase();
      
      if (csValue.includes('enterprise') || csValue.includes('large')) {
        score += 20;
      } else if (csValue.includes('medium')) {
        score += 10;
      } else if (csValue.includes('small') || csValue.includes('startup')) {
        score -= 10;
      }
    }
    
    // Business type affects potential revenue
    if (typeof businessType.value === 'string') {
      const btValue = businessType.value.toLowerCase();
      
      // High-value industries
      if (btValue.includes('finance') || btValue.includes('banking') || 
          btValue.includes('insurance') || btValue.includes('healthcare')) {
        score += 10;
      }
      
      // Lower-value industries
      if (btValue.includes('non-profit') || btValue.includes('education')) {
        score -= 10;
      }
    }
    
    // Direct revenue indicators
    if (typeof revenueIndicators.value === 'string') {
      const riValue = revenueIndicators.value.toLowerCase();
      
      // Positive indicators
      if (riValue.includes('growing') || riValue.includes('growth')) {
        score += 10;
      }
      if (riValue.includes('profitable') || riValue.includes('revenue')) {
        score += 10;
      }
      if (riValue.includes('funding') || riValue.includes('investment')) {
        score += 5;
      }
      
      // Negative indicators
      if (riValue.includes('decline') || riValue.includes('struggling')) {
        score -= 15;
      }
      if (riValue.includes('budget constraint') || riValue.includes('cost cutting')) {
        score -= 10;
      }
    }
    
    // Ensure the score is within bounds
    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error calculating revenue:', error);
    return defaultScore;
  }
}

function calculateAIEase(data) {
  const defaultScore = 70;
  
  try {
    // Base AI ease score
    let score = defaultScore;
    
    const technologiesUsed = data.technologies_used || {};
    const automationOpportunities = data.automation_opportunities || {};
    
    // Technologies used indicate AI readiness
    if (typeof technologiesUsed.value === 'string') {
      const techValue = technologiesUsed.value.toLowerCase();
      
      // Check for AI-friendly technologies
      if (techValue.includes('api') || techValue.includes('rest')) {
        score += 10;
      }
      if (techValue.includes('cloud') || techValue.includes('aws') || 
          techValue.includes('azure') || techValue.includes('google')) {
        score += 10;
      }
      if (techValue.includes('data') || techValue.includes('analytics')) {
        score += 15;
      }
      if (techValue.includes('ai') || techValue.includes('machine learning')) {
        score += 20; // Already using AI is a strong positive signal
      }
      
      // Check for AI-unfriendly technologies
      if (techValue.includes('legacy') || techValue.includes('mainframe')) {
        score -= 15;
      }
      if (techValue.includes('on-premise') || techValue.includes('on premise')) {
        score -= 5;
      }
    }
    
    // Automation opportunities indicate AI applicability
    if (typeof automationOpportunities.value === 'string') {
      const aoValue = automationOpportunities.value.toLowerCase();
      
      // Count the number of automation opportunities
      const opCount = (aoValue.match(/,/g) || []).length + 1;
      
      if (opCount > 3) {
        score += 15;
      } else if (opCount > 1) {
        score += 5;
      }
      
      // Check for specific high-value automation opportunities
      if (aoValue.includes('data processing') || aoValue.includes('analysis')) {
        score += 10;
      }
      if (aoValue.includes('customer service') || aoValue.includes('support')) {
        score += 10;
      }
      if (aoValue.includes('decision') || aoValue.includes('prediction')) {
        score += 10;
      }
    }
    
    // Ensure the score is within bounds
    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error calculating AI ease:', error);
    return defaultScore;
  }
}

function generateInsights(data) {
  // Default insights if we can't generate from data
  const defaultInsights = [
    "Strong market presence in their industry",
    "Clear need for automation in their processes",
    "Potential budget available for implementation",
    "Technical team likely in place for integration"
  ];
  
  try {
    const insights = [];
    
    // Generate insights from business type
    if (data.business_type && data.business_type.value) {
      insights.push(`Company operates in the ${data.business_type.value} sector`);
    }
    
    // Generate insights from company size
    if (data.company_size && data.company_size.value) {
      insights.push(`${data.company_size.value} size organization`);
    }
    
    // Generate insights from technologies used
    if (data.technologies_used && data.technologies_used.value) {
      insights.push(`Technology stack includes: ${data.technologies_used.value}`);
    }
    
    // Generate insights from pain points
    if (data.pain_points && data.pain_points.value) {
      insights.push(`Key challenges: ${data.pain_points.value}`);
    }
    
    // Generate insights from automation opportunities
    if (data.automation_opportunities && data.automation_opportunities.value) {
      insights.push(`Automation potential in: ${data.automation_opportunities.value}`);
    }
    
    // Add contact information insight if available
    if (data.contact_information && data.contact_information.value) {
      insights.push(`Contact channels available`);
    }
    
    // Return default insights if we couldn't generate any
    return insights.length > 0 ? insights : defaultInsights;
  } catch (error) {
    console.error('Error generating insights:', error);
    return defaultInsights;
  }
}

function generateRecommendations(data) {
  // Default recommendations if we can't generate from data
  const defaultRecommendations = [
    "Focus on ROI in initial pitch",
    "Highlight successful case studies similar to their industry",
    "Prepare technical implementation plan",
    "Schedule demo with their technical team"
  ];
  
  try {
    const recommendations = [];
    
    // Generate recommendations based on business type
    if (data.business_type && data.business_type.value) {
      const btValue = String(data.business_type.value).toLowerCase();
      
      if (btValue.includes('b2b') || btValue.includes('enterprise')) {
        recommendations.push("Prepare enterprise-focused case studies with similar organizations");
      } else if (btValue.includes('ecommerce') || btValue.includes('retail')) {
        recommendations.push("Highlight customer experience improvements and conversion rate increases");
      } else if (btValue.includes('healthcare') || btValue.includes('finance')) {
        recommendations.push("Emphasize compliance and security aspects of the solution");
      }
    }
    
    // Generate recommendations based on pain points
    if (data.pain_points && data.pain_points.value) {
      const ppValue = String(data.pain_points.value).toLowerCase();
      
      if (ppValue.includes('efficiency') || ppValue.includes('productivity')) {
        recommendations.push("Focus on efficiency gains and time savings in the proposal");
      }
      if (ppValue.includes('cost') || ppValue.includes('expensive')) {
        recommendations.push("Prepare detailed ROI analysis highlighting cost reduction");
      }
      if (ppValue.includes('manual') || ppValue.includes('time-consuming')) {
        recommendations.push("Demonstrate automation capabilities with concrete examples");
      }
    }
    
    // Generate recommendations based on automation opportunities
    if (data.automation_opportunities && data.automation_opportunities.value) {
      recommendations.push(`Target solution to address: ${data.automation_opportunities.value}`);
    }
    
    // Add generic but valuable recommendations
    recommendations.push("Schedule a discovery call to better understand technical requirements");
    
    // If contact information is available
    if (data.contact_information && data.contact_information.value) {
      recommendations.push("Reach out through available channels to establish initial contact");
    }
    
    // Return default recommendations if we couldn't generate any
    return recommendations.length > 0 ? recommendations : defaultRecommendations;
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return defaultRecommendations;
  }
}

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`Mode: ${isProduction ? 'Production' : 'Development'}`);
});