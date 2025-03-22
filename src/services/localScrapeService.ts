import crypto from 'crypto';
import type { Lead } from '../types';

/**
 * Mock implementation of localScrapeService
 * 
 * This is a lightweight replacement for the Puppeteer-based scraper
 * to allow development to continue without the heavy dependency
 */

// Configuration
const CONFIG = {
  // Simulate delay to mimic real scraping (ms)
  SIMULATE_DELAY: 1500,
  // Probability (0-1) that mock scraping will fail
  FAILURE_PROBABILITY: 0.1,
};

/**
 * Generate a unique ID from a URL using SHA-256 hash
 */
function generateId(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

/**
 * Derive a consistent random number from a string seed
 */
function getSeededRandom(seed: string, min = 0, max = 1): number {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  // Use first 8 chars of hash as a deterministic number
  const normalizedValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  return normalizedValue * (max - min) + min;
}

/**
 * Generate consistent mock scores based on URL
 */
function generateMockScores(url: string) {
  // Generate deterministic scores based on the URL
  const baseSeed = url.toLowerCase();
  
  return {
    dealPotential: Math.floor(getSeededRandom(`${baseSeed}-deal`, 60, 95)),
    practicality: Math.floor(getSeededRandom(`${baseSeed}-prac`, 55, 90)),
    difficulty: Math.floor(getSeededRandom(`${baseSeed}-diff`, 40, 85)),
    revenue: Math.floor(getSeededRandom(`${baseSeed}-rev`, 65, 95)),
    aiEase: Math.floor(getSeededRandom(`${baseSeed}-ai`, 60, 90)),
  };
}

/**
 * Calculate total score from individual scores
 */
function calculateTotalScore(scores: { 
  dealPotential: number;
  practicality: number;
  difficulty: number;
  revenue: number;
  aiEase: number;
}): number {
  // Define weights for each score component
  const weights = {
    dealPotential: 0.25,
    practicality: 0.2,
    revenue: 0.3,
    aiEase: 0.15,
    difficulty: 0.1,
  };

  // Calculate weighted score (note: lower difficulty is better)
  return Math.round(
    scores.dealPotential * weights.dealPotential +
    scores.practicality * weights.practicality +
    scores.revenue * weights.revenue +
    scores.aiEase * weights.aiEase +
    (100 - scores.difficulty) * weights.difficulty
  );
}

/**
 * Generate mock insights based on URL and scores
 */
function generateInsights(url: string, scores: { 
  dealPotential: number;
  practicality: number;
  difficulty: number;
  revenue: number;
  aiEase: number;
}): string[] {
  const urlObj = new URL(url);
  const insights = [
    `${urlObj.hostname} shows potential for automation in multiple areas`,
    `Business appears to be in the ${scores.dealPotential > 80 ? 'enterprise' : 'mid-market'} segment`,
    'Website indicates need for improved customer engagement solutions',
    'Technical implementation appears to be feasible based on site structure'
  ];

  // Add conditional insights based on scores
  if (scores.revenue > 85) {
    insights.push('High revenue potential indicates budget availability for solutions');
  }
  
  if (scores.difficulty < 60) {
    insights.push('Implementation complexity is manageable with current technology stack');
  }

  return insights;
}

/**
 * Generate mock recommendations based on URL and scores
 */
function generateRecommendations(url: string, scores: { 
  dealPotential: number;
  practicality: number;
  difficulty: number;
  revenue: number;
  aiEase: number;
}): string[] {
  const recommendations = [
    `Prepare a tailored proposal highlighting ${scores.dealPotential > 80 ? 'ROI' : 'growth potential'}`,
    'Schedule an initial discovery call to identify specific pain points',
    'Develop a phased implementation plan to manage complexity'
  ];

  // Add conditional recommendations based on scores
  if (scores.aiEase > 75) {
    recommendations.push('Highlight AI automation capabilities in the proposal');
  }
  
  if (scores.practicality < 70) {
    recommendations.push('Consider a proof-of-concept to address implementation concerns');
  }

  return recommendations;
}

/**
 * Generate mock page info based on URL
 */
function generatePageInfo(url: string) {
  const urlObj = new URL(url);
  const titlePrefix = urlObj.hostname.split('.')[0].charAt(0).toUpperCase() + urlObj.hostname.split('.')[0].slice(1);
  
  return {
    title: `${titlePrefix} - ${getSeededRandom(url) > 0.5 ? 'Home' : 'Welcome to ' + urlObj.hostname}`,
    description: `${titlePrefix} provides innovative solutions for businesses of all sizes.`,
    headingsCount: Math.floor(getSeededRandom(`${url}-headings`, 5, 15)),
    textLength: Math.floor(getSeededRandom(`${url}-text`, 2000, 10000)),
    extractTime: new Date().toISOString()
  };
}

/**
 * Mock implementation of local web scraping
 * This is used instead of a real Puppeteer implementation
 * to allow development without the heavy dependency
 * 
 * @param url URL to scrape
 * @returns Promise<Lead> Lead analysis data
 */
export async function mockLocalScrape(url: string): Promise<Lead> {
  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, CONFIG.SIMULATE_DELAY));
  
  // Occasionally simulate a failure to test error handling
  if (Math.random() < CONFIG.FAILURE_PROBABILITY) {
    throw new Error('Scraping failed: Could not access the website. Please try again.');
  }

  // Generate deterministic mock scores based on the URL
  const scores = generateMockScores(url);
  
  // Calculate total score
  const totalScore = calculateTotalScore(scores);

  // Extract domain for company name
  const urlObj = new URL(url);
  const companyName = urlObj.hostname.split('.')[0].charAt(0).toUpperCase() + urlObj.hostname.split('.')[0].slice(1);

  // Build the lead object
  const lead: Lead = {
    id: generateId(url),
    url,
    companyName: `${companyName} ${urlObj.hostname.includes('.com') ? 'Inc.' : 'LLC'}`,
    ...scores,
    totalScore,
    insights: generateInsights(url, scores),
    recommendations: generateRecommendations(url, scores),
    isLocalAnalysis: true,
    pageInfo: generatePageInfo(url),
    scoringDetails: {
      weights: {
        dealPotential: 0.25,
        practicality: 0.2,
        revenue: 0.3,
        aiEase: 0.15,
        difficulty: 0.1
      },
      penalties: [], // No penalties in mock data
      rawTotal: totalScore,
      totalPenalty: 0
    }
  };

  return lead;
}