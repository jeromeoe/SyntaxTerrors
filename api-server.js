import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

function getSeededRandom(seed, min = 0, max = 1) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  const normalizedValue = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
  return normalizedValue * (max - min) + min;
}

function generateMockScores(url) {
  const baseSeed = url.toLowerCase();
  
  return {
    dealPotential: Math.floor(getSeededRandom(`${baseSeed}-deal`, 60, 95)),
    practicality: Math.floor(getSeededRandom(`${baseSeed}-prac`, 55, 90)),
    difficulty: Math.floor(getSeededRandom(`${baseSeed}-diff`, 40, 85)),
    revenue: Math.floor(getSeededRandom(`${baseSeed}-rev`, 65, 95)),
    aiEase: Math.floor(getSeededRandom(`${baseSeed}-ai`, 60, 90)),
  };
}

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

function generateInsights(url, scores) {
  const domain = new URL(url).hostname;
  const insights = [
    `${domain} shows potential for automation in multiple areas`,
    `Business appears to be in the ${scores.dealPotential > 80 ? 'enterprise' : 'mid-market'} segment`,
    'Website indicates need for improved customer engagement solutions',
    'Technical implementation appears to be feasible based on site structure'
  ];

  if (scores.revenue > 85) {
    insights.push('High revenue potential indicates budget availability for solutions');
  }
  
  if (scores.difficulty < 60) {
    insights.push('Implementation complexity is manageable with current technology stack');
  }

  return insights;
}

function generateRecommendations(url, scores) {
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

  return recommendations;
}

function generatePageInfo(url) {
  const domain = new URL(url).hostname;
  const titlePrefix = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  
  return {
    title: `${titlePrefix} - ${getSeededRandom(url) > 0.5 ? 'Home' : 'Welcome to ' + domain}`,
    description: `${titlePrefix} provides innovative solutions for businesses of all sizes.`,
    headingsCount: Math.floor(getSeededRandom(`${url}-headings`, 5, 15)),
    textLength: Math.floor(getSeededRandom(`${url}-text`, 2000, 10000)),
    extractTime: new Date().toISOString()
  };
}

app.get('/api/health-check', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

app.post('/api/local-scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ message: 'Invalid URL format' });
    }

    const scores = generateMockScores(url);
    const totalScore = calculateTotalScore(scores);

    const domain = new URL(url).hostname;
    const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

    const responseData = {
      id: generateId(url),
      url,
      companyName: `${companyName} ${domain.includes('.com') ? 'Inc.' : 'LLC'}`,
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
        penalties: [],
        rawTotal: totalScore,
        totalPenalty: 0
      }
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      message: 'An error occurred while analyzing the lead'
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});