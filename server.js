import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JIGSAWSTACK_API_KEY = process.env.JIGSAWSTACK_API_KEY;
if (!JIGSAWSTACK_API_KEY) {
  console.warn('JIGSAWSTACK_API_KEY environment variable is not set. Using mock data only.');
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

/**
 * Generate mock data for when API calls fail
 * @param {string} url - The URL that was being analyzed
 * @returns {Object} - Mock data that simulates API response
 */
function generateMockData(url) {
  const getRandomScore = () => Math.floor(Math.random() * 36) + 60;
  
  return {
    scores: {
      dealPotential: getRandomScore(),
      practicality: getRandomScore(),
      difficulty: getRandomScore(),
      revenue: getRandomScore(),
      aiEase: getRandomScore()
    },
    insights: [
      "Strong market presence in AI solutions",
      "Clear need for automation",
      "Budget available for implementation",
      "Technical team in place for integration"
    ],
    recommendations: [
      "Focus on ROI in initial pitch",
      "Highlight successful case studies",
      "Prepare technical implementation plan",
      "Schedule demo with technical team"
    ]
  };
}

/**
 * Advanced Lead Scoring System
 * 
 * This function implements a sophisticated scoring algorithm that:
 * 1. Normalizes all metrics to a 0-100 scale
 * 2. Applies dynamic weighting based on business priorities
 * 3. Applies penalties for critical metrics below thresholds
 * 4. Handles missing or invalid data gracefully
 * 
 * @param {Object} scores - The raw scores object from the API
 * @returns {Object} - Detailed scoring information including the total score
 */
function calculateScores(scores) {
  // Default values if scores are missing
  const DEFAULT_SCORE = 50;
  
  // Extract and normalize scores (ensure they're within 0-100 range)
  const normalizedScores = {
    dealPotential: normalizeScore(scores.dealPotential, DEFAULT_SCORE),
    practicality: normalizeScore(scores.practicality, DEFAULT_SCORE),
    revenue: normalizeScore(scores.revenue, DEFAULT_SCORE),
    aiEase: normalizeScore(scores.aiEase, DEFAULT_SCORE),
    difficulty: normalizeScore(scores.difficulty, DEFAULT_SCORE)
  };
  
  // Define weights for each metric (total should equal 1)
  const weights = {
    dealPotential: 0.25,  // Increased from 0.3 to 0.25
    practicality: 0.20,   // Unchanged at 0.2
    revenue: 0.30,        // Increased from 0.25 to 0.3
    aiEase: 0.15,         // Unchanged at 0.15
    difficulty: 0.10      // Unchanged at 0.1
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
    // For difficulty, we invert the score (lower difficulty is better)
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

/**
 * Normalize a score to ensure it's within the 0-100 range
 * 
 * @param {number|any} score - The raw score to normalize
 * @param {number} defaultValue - Default value if score is invalid
 * @returns {number} - Normalized score between 0 and 100
 */
function normalizeScore(score, defaultValue = 50) {
  // Check if score is a valid number
  if (score === undefined || score === null || isNaN(Number(score))) {
    return defaultValue;
  }
  
  // Convert to number and clamp between 0-100
  return Math.max(0, Math.min(100, Number(score)));
}

/**
 * Safely parse JSON without throwing exceptions
 * @param {Response} response - Fetch API Response object
 * @returns {Promise<Object>} - Parsed JSON or null if parsing fails
 */
async function safeJsonParse(response) {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      console.warn('Received empty response from API');
      return null;
    }
    return JSON.parse(text);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
}

app.post('/api/analyze-lead', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    // Log request information
    console.log(`Processing request to analyze: ${url}`);
    console.log('Request headers:', req.headers);

    // Declare apiData outside the try block
    let apiData;
    let usedMockData = false;

    try {
      // If API key is not set, use mock data directly without making API call
      if (!JIGSAWSTACK_API_KEY) {
        console.log('Using mock data (no API key configured)');
        apiData = generateMockData(url);
        usedMockData = true;
      } else {
        // Call JigsawStack API with enhanced headers to bypass blocking
        const jigsawstackUrl = 'https://api.jigsawstack.com/scrape';
        
        // Set timeout for the fetch request (15 seconds)
        const timeout = 15000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(jigsawstackUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${JIGSAWSTACK_API_KEY}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://aileadqualifier.com/',
              'Origin': 'https://aileadqualifier.com'
            },
            body: JSON.stringify({ 
              url,
              // Include these options to improve success rate with JigsawStack
              options: {
                waitForSelector: 'body',
                javascript: true,
                blockedResourceTypes: ['image', 'media', 'font', 'stylesheet'],
                timeout: 10000
              }
            }),
            signal: controller.signal
          });
          
          // Log response status and headers
          console.log(`JigsawStack API response status: ${response.status}`);
          console.log('Response headers:', [...response.headers.entries()].reduce((obj, [key, val]) => {
            obj[key] = val;
            return obj;
          }, {}));

          // Use our safe JSON parsing function
          const jsonData = await safeJsonParse(response);
          
          // Check if we got a valid response
          if (!response.ok || !jsonData) {
            console.warn(`JigsawStack API returned an error or invalid JSON. Status: ${response.status}. Using mock data instead.`);
            apiData = generateMockData(url);
            usedMockData = true;
          } else {
            apiData = jsonData;
          }
        } catch (fetchError) {
          console.error('Error calling JigsawStack API:', fetchError);
          // Fallback to mock data if API call fails completely
          apiData = generateMockData(url);
          usedMockData = true;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (apiError) {
      console.error('Error in API processing:', apiError);
      // Fallback to mock data if API call fails completely
      apiData = generateMockData(url);
      usedMockData = true;
    }
    
    // Extract scores from API response
    const scores = apiData.scores || {};

    // Calculate detailed scores using our enhanced algorithm
    const scoringDetails = calculateScores(scores);

    // Extract domain for company name
    let domain;
    try {
      domain = new URL(url).host;
    } catch (error) {
      domain = url;
    }
    const companyName = `Company from ${domain}`;

    // Prepare response data
    const responseData = {
      id: generateId(url),
      url,
      companyName,
      ...scores, // Include original scores
      ...scoringDetails.normalizedScores, // Include normalized scores
      totalScore: scoringDetails.totalScore,
      scoringDetails: {
        weights: scoringDetails.weights,
        penalties: scoringDetails.penalties,
        rawTotal: scoringDetails.rawTotal,
        totalPenalty: scoringDetails.totalPenalty
      },
      insights: apiData.insights || [],
      recommendations: apiData.recommendations || [],
      usedMockData: usedMockData // Flag to indicate if we used mock data (useful for debugging)
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'An error occurred while analyzing the lead'
    });
  }
});

// Handle all other routes - important for SPA with client-side routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});