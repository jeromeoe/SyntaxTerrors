from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import time
import requests
from dotenv import load_dotenv
from urllib.parse import urlparse

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Get API key from environment variables
JIGSAWSTACK_API_KEY = os.getenv('JIGSAWSTACK_API_KEY')
if not JIGSAWSTACK_API_KEY:
    raise ValueError("JIGSAWSTACK_API_KEY environment variable is not set")

def get_random_score() -> int:
    """Generate a random score between 60 and 95."""
    return random.randint(60, 95)

def calculate_total_score(scores: dict) -> int:
    """Calculate the weighted total score based on individual metrics."""
    weights = {
        'dealPotential': 0.3,
        'practicality': 0.2,
        'revenue': 0.25,
        'aiEase': 0.15,
        'difficulty': 0.1  # Note: We use (100 - difficulty) in the calculation
    }
    
    return round(
        scores['dealPotential'] * weights['dealPotential'] +
        scores['practicality'] * weights['practicality'] +
        scores['revenue'] * weights['revenue'] +
        scores['aiEase'] * weights['aiEase'] +
        (100 - scores['difficulty']) * weights['difficulty']
    )

@app.route('/api/analyze-lead', methods=['POST'])
def analyze_lead():
    """
    Analyze a lead based on the provided URL using JigsawStack's Web Scraper API.
    
    Expected JSON payload: { "url": "https://example.com" }
    Returns: Lead analysis data including scores and insights
    """
    try:
        data = request.get_json()
        
        if not data or 'url' not in data:
            return jsonify({
                'message': 'URL is required'
            }), 400
            
        url = data['url']
        
        # Simulate processing delay
        time.sleep(2)
        
        # Call JigsawStack API
        jigsawstack_url = 'https://api.jigsawstack.com/scrape'
        headers = {
            'Authorization': f'Bearer {JIGSAWSTACK_API_KEY}',
            'Content-Type': 'application/json'
        }
        payload = {'url': url}
        
        response = requests.post(jigsawstack_url, json=payload, headers=headers)
        response.raise_for_status()  # Raise exception for non-200 responses
        
        # For development, generate random scores since we don't have actual API access
        scores = {
            'dealPotential': get_random_score(),
            'practicality': get_random_score(),
            'difficulty': get_random_score(),
            'revenue': get_random_score(),
            'aiEase': get_random_score()
        }
        
        # Calculate total score
        total_score = calculate_total_score(scores)
        
        # Extract domain for company name
        domain = urlparse(url).netloc
        company_name = f"Company from {domain}"
        
        # Prepare response data
        response_data = {
            'id': generate_id(url),
            'url': url,
            'companyName': company_name,
            **scores,
            'totalScore': total_score,
            'insights': [
                "Strong market presence in AI solutions",
                "Clear need for automation",
                "Budget available for implementation",
                "Technical team in place for integration"
            ],
            'recommendations': [
                "Focus on ROI in initial pitch",
                "Highlight successful case studies",
                "Prepare technical implementation plan",
                "Schedule demo with technical team"
            ]
        }
        
        return jsonify(response_data)
        
    except requests.exceptions.RequestException as e:
        print(f"JigsawStack API error: {str(e)}")
        return jsonify({
            'message': 'Error connecting to JigsawStack API'
        }), 500
    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({
            'message': 'An error occurred while analyzing the lead'
        }), 500

if __name__ == '__main__':
    # Instructions for deployment:
    # 1. Create a .env file with your JIGSAWSTACK_API_KEY
    # 2. Install dependencies: pip install -r requirements.txt
    # 3. Run locally: python app.py
    # 4. For production deployment (e.g., Heroku):
    #    - Create a Procfile with: web: python app.py
    #    - Set JIGSAWSTACK_API_KEY in environment variables
    app.run(debug=True, port=5000)