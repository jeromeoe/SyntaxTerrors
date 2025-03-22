# AI Lead Qualifier

A powerful tool that analyzes websites to identify and qualify potential business leads, providing actionable insights and recommendations.

## Features

- Website analysis for lead qualification
- Email validation
- Advanced scoring algorithm
- Detailed insights and recommendations
- Web scraping with Puppeteer

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Express.js API with Puppeteer for web scraping
- **Python Backend**: Flask API (alternative backend)

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.8+) (if using the Python backend)

### Setup

1. Clone the repository
2. Install dependencies:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies (if using Python backend)
pip install -r backend/requirements.txt
```

3. Start the development servers:

```bash
# Start both frontend and backend
npm run start

# Or start them individually:
# Frontend only
npm run dev

# Backend only
npm run server
```

4. Access the application at `http://localhost:5173`

## Backend Architecture

The application has two backend options:

1. **Node.js backend (api-server.js)**: 
   - Uses Puppeteer for web scraping
   - Provides lead analysis through a mock LLM implementation
   - Handles all API endpoints for the application

2. **Python Flask backend (backend/app.py)**:
   - Provides an alternative implementation
   - Uses mock data generation for lead analysis

## Deployment

### Frontend Deployment

Build the frontend for production:

```bash
npm run build
```

### Backend Deployment

The backend can be deployed to platforms like Heroku, AWS, or Google Cloud.

## API Reference

### `/api/local-scrape`

**Method**: POST

**Payload**:
```json
{
  "url": "https://example.com",
  "email": "user@example.com" (optional)
}
```

**Response**:
```json
{
  "id": "12ab34cd",
  "url": "https://example.com",
  "companyName": "Example Company",
  "dealPotential": 85,
  "practicality": 75,
  "revenue": 90,
  "aiEase": 80,
  "difficulty": 60,
  "totalScore": 82,
  "scoringDetails": { ... },
  "insights": [ ... ],
  "recommendations": [ ... ]
}
```

## License

MIT