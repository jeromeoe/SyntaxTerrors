# AI Lead Qualifier

A powerful tool that analyzes websites to identify and qualify potential business leads, providing actionable insights and recommendations.

## Features

- Website analysis for lead qualification
- Email validation
- Advanced scoring algorithm
- Detailed insights and recommendations
- Secure backend proxy to JigsawStack API

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Python Flask API
- **APIs**: JigsawStack for web scraping and email validation

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.8+)
- JigsawStack API key

### Setup

1. Clone the repository
2. Install dependencies:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r backend/requirements.txt
```

3. Create a `.env` file in the root directory with your JigsawStack API key:

```
JIGSAWSTACK_API_KEY=your_api_key_here
VITE_SUPABASE_ANON_KEY=your_supabase_key
VITE_SUPABASE_URL=your_supabase_url
```

4. Start the development servers:

```bash
# Start the frontend
npm run dev

# Start the backend in a separate terminal
python backend/app.py
```

5. Access the application at `http://localhost:5173`

## Backend Architecture

The backend serves as a secure proxy between the frontend and JigsawStack API, handling:

1. Email validation
2. Website analysis
3. Score calculation
4. Error handling

## Deployment

### Frontend Deployment

Build the frontend for production:

```bash
npm run build
```

### Backend Deployment

The backend can be deployed to platforms like Heroku, AWS, or Google Cloud.

For Heroku deployment:

1. Create a `Procfile` in the root directory:
```
web: cd backend && python app.py
```

2. Set the environment variables on your hosting platform:
```
JIGSAWSTACK_API_KEY=your_api_key_here
```

## API Reference

### `/api/analyze-lead`

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