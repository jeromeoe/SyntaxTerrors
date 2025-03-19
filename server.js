import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

function generateId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
}

function getRandomScore() {
  return Math.floor(Math.random() * 36) + 60;
}

function calculateTotalScore(scores) {
  const weights = {
    dealPotential: 0.3,
    practicality: 0.2,
    revenue: 0.25,
    aiEase: 0.15,
    difficulty: 0.1
  };

  return Math.round(
    scores.dealPotential * weights.dealPotential +
    scores.practicality * weights.practicality +
    scores.revenue * weights.revenue +
    scores.aiEase * weights.aiEase +
    (100 - scores.difficulty) * weights.difficulty
  );
}

app.post('/api/analyze-lead', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate random scores
    const scores = {
      dealPotential: getRandomScore(),
      practicality: getRandomScore(),
      difficulty: getRandomScore(),
      revenue: getRandomScore(),
      aiEase: getRandomScore()
    };

    // Calculate total score
    const totalScore = calculateTotalScore(scores);

    // Extract domain for company name
    const domain = new URL(url).host;
    const companyName = `Company from ${domain}`;

    // Prepare response data
    const responseData = {
      id: generateId(url),
      url,
      companyName,
      ...scores,
      totalScore,
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
  console.log(`Server running at http://localhost:${PORT}`);
});