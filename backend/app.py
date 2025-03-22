from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import hashlib
import json
import requests
from dotenv import load_dotenv
from urllib.parse import urlparse
import time
import re

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Enable CORS for all routes and origins
CORS(app, resources={r"/api/*": {"origins": "*"}})

def generate_id(url: str) -> str:
    """Generate a unique ID from a URL using SHA-256 hash."""
    return hashlib.sha256(url.encode()).hexdigest()[:8]

def normalize_score(score, default_value=50):
    """
    Normalize a score to ensure it's within the 0-100 range.
    
    Args:
        score: The raw score to normalize
        default_value: Default value if score is invalid
        
    Returns:
        float: Normalized score between 0 and 100
    """
    # Check if score is a valid number
    if score is None or not isinstance(score, (int, float)):
        return default_value
    
    # Clamp between 0-100
    return max(0, min(100, float(score)))

def is_valid_email(email: str) -> bool:
    """
    Perform basic email validation before sending to API.
    
    Args:
        email (str): Email address to validate
        
    Returns:
        bool: True if the email format is valid
    """
    # Basic regex for email validation
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_pattern, email))

def is_valid_url(url: str) -> bool:
    """
    Perform basic URL validation before sending to API.
    
    Args:
        url (str): URL to validate
        
    Returns:
        bool: True if the URL format is valid
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

def sanitize_input(input_string: str) -> str:
    """
    Sanitize input to prevent injection attacks.
    
    Args:
        input_string (str): String to sanitize
        
    Returns:
        str: Sanitized string
    """
    # Remove any control characters and strip whitespace
    if not isinstance(input_string, str):
        return ""
    
    sanitized = re.sub(r'[\x00-\x1F\x7F]', '', input_string)
    return sanitized.strip()

def calculate_scores(scores):
    """
    Advanced Lead Scoring System
    
    This function implements a sophisticated scoring algorithm that:
    1. Normalizes all metrics to a 0-100 scale
    2. Applies dynamic weighting based on business priorities
    3. Applies penalties for critical metrics below thresholds
    4. Handles missing or invalid data gracefully
    
    Args:
        scores (dict): The raw scores dictionary from the API
        
    Returns:
        dict: Detailed scoring information including the total score
    """
    # Default value if scores are missing
    DEFAULT_SCORE = 50
    
    # Extract and normalize scores
    normalized_scores = {
        'dealPotential': normalize_score(scores.get('dealPotential'), DEFAULT_SCORE),
        'practicality': normalize_score(scores.get('practicality'), DEFAULT_SCORE),
        'revenue': normalize_score(scores.get('revenue'), DEFAULT_SCORE),
        'aiEase': normalize_score(scores.get('aiEase'), DEFAULT_SCORE),
        'difficulty': normalize_score(scores.get('difficulty'), DEFAULT_SCORE)
    }
    
    # Define weights for each metric (total should equal 1)
    weights = {
        'dealPotential': 0.25,
        'practicality': 0.20,
        'revenue': 0.30,
        'aiEase': 0.15,
        'difficulty': 0.10
    }
    
    # Critical thresholds that trigger penalties
    thresholds = {
        'dealPotential': 50,
        'revenue': 50
    }
    
    # Calculate the weighted score components
    weighted_scores = {
        'dealPotential': normalized_scores['dealPotential'] * weights['dealPotential'],
        'practicality': normalized_scores['practicality'] * weights['practicality'],
        'revenue': normalized_scores['revenue'] * weights['revenue'],
        'aiEase': normalized_scores['aiEase'] * weights['aiEase'],
        # For difficulty, we invert the score (lower difficulty is better)
        'difficulty': (100 - normalized_scores['difficulty']) * weights['difficulty']
    }
    
    # Calculate raw total (before penalties)
    raw_total = sum(weighted_scores.values())
    
    # Calculate penalties
    penalties = []
    
    # Check for critical metrics below thresholds
    for metric, threshold in thresholds.items():
        if normalized_scores[metric] < threshold:
            # Calculate penalty: 5% reduction for each 10 points below threshold
            shortfall = threshold - normalized_scores[metric]
            penalty_factor = (shortfall // 10 + 1) * 0.05
            penalty_value = raw_total * penalty_factor
            
            penalties.append({
                'metric': metric,
                'threshold': threshold,
                'actual': normalized_scores[metric],
                'penaltyFactor': penalty_factor,
                'penaltyValue': penalty_value
            })
    
    # Apply penalties to get final score
    total_penalty = sum(p['penaltyValue'] for p in penalties)
    final_score = max(0, min(100, round(raw_total - total_penalty)))
    
    # Return comprehensive scoring object
    return {
        'normalizedScores': normalized_scores,
        'weights': weights,
        'weightedScores': weighted_scores,
        'rawTotal': raw_total,
        'penalties': penalties,
        'totalPenalty': total_penalty,
        'totalScore': final_score
    }

@app.route('/api/health-check', methods=['GET', 'HEAD'])
def health_check():
    """
    Simple health check endpoint to verify if the server is running
    and the client can connect to it.
    """
    return jsonify({
        'status': 'ok',
        'timestamp': time.time()
    })

# Simplified mock implementation for the Flask backend
# This completely removes JigsawStack dependency
@app.route('/api/analyze-lead', methods=['POST'])
def analyze_lead():
    """
    Analyze a lead based on the provided URL. Uses a mock implementation
    instead of external API calls to JigsawStack.
    
    Expected JSON payload: 
    {
        "url": "https://example.com",
        "email": "user@example.com" (optional)
    }
    
    Returns: Lead analysis data including scores and insights
    """
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Validate required fields
        if not data or 'url' not in data:
            return jsonify({
                'message': 'URL is required'
            }), 400
            
        url = sanitize_input(data['url'])
        email = sanitize_input(data.get('email', ''))
        
        # Validate URL format
        if not is_valid_url(url):
            return jsonify({
                'message': 'Invalid URL format'
            }), 400
        
        # Email validation step (if email is provided)
        email_validation = None
        if email:
            app.logger.info(f"Email provided: {email}")
            
            # Basic validation only - no external API call
            if is_valid_email(email):
                email_validation = {
                    'is_valid': True,
                    'is_disposable': False,
                    'has_mx_records': True
                }
            else:
                return jsonify({
                    'message': f"Invalid email format: {email}",
                }), 400
        
        # Generate deterministic mock scores based on the URL
        url_hash = hashlib.md5(url.encode()).digest()
        scores = {
            'dealPotential': int.from_bytes(url_hash[0:2], byteorder='big') % 30 + 60,
            'practicality': int.from_bytes(url_hash[2:4], byteorder='big') % 30 + 60,
            'difficulty': int.from_bytes(url_hash[4:6], byteorder='big') % 30 + 60,
            'revenue': int.from_bytes(url_hash[6:8], byteorder='big') % 30 + 60,
            'aiEase': int.from_bytes(url_hash[8:10], byteorder='big') % 30 + 60
        }
            
        insights = [
            "Strong market presence in their industry",
            "Clear need for automation in their processes",
            "Potential budget available for implementation",
            "Technical team likely in place for integration"
        ]
            
        recommendations = [
            "Focus on ROI in initial pitch",
            "Highlight successful case studies similar to their industry",
            "Prepare technical implementation plan",
            "Schedule demo with their technical team"
        ]
        
        # Calculate detailed scores using our enhanced algorithm
        scoring_details = calculate_scores(scores)
        
        # Extract domain for company name
        domain = urlparse(url).netloc
        company_name = f"Company from {domain}"
        
        # Prepare response data
        response_data = {
            'id': generate_id(url),
            'url': url,
            'companyName': company_name,
            **scores,  # Include original scores
            **scoring_details['normalizedScores'],  # Include normalized scores
            'totalScore': scoring_details['totalScore'],
            'scoringDetails': {
                'weights': scoring_details['weights'],
                'penalties': scoring_details['penalties'],
                'rawTotal': scoring_details['rawTotal'],
                'totalPenalty': scoring_details['totalPenalty']
            },
            'insights': insights,
            'recommendations': recommendations
        }
        
        # If email was provided and validated, include in response
        if email and email_validation:
            response_data['email'] = {
                'address': email,
                'validation': email_validation
            }
        
        return jsonify(response_data)
        
    except Exception as e:
        app.logger.error(f"Error processing request: {str(e)}")
        return jsonify({
            'message': f'An error occurred while analyzing the lead: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Instructions for deployment:
    # 1. Create a .env file with your configuration
    # 2. Install dependencies: pip install -r requirements.txt
    # 3. Run locally: python app.py
    app.run(debug=True, host='0.0.0.0', port=5000)