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
CORS(app)

# Get API key from environment variables
JIGSAWSTACK_API_KEY = os.getenv('JIGSAWSTACK_API_KEY')
if not JIGSAWSTACK_API_KEY:
    raise ValueError("JIGSAWSTACK_API_KEY environment variable is not set")

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

def validate_email(email: str) -> dict:
    """
    Validate an email address using JigsawStack's Email Validation API.
    
    This function makes a GET request to the JigsawStack email validation endpoint
    and returns the validation result. The API key is sent in the header for authentication.
    
    Args:
        email (str): The email address to validate
        
    Returns:
        dict: A dictionary containing validation results with the following keys:
            - is_valid (bool): Whether the email is valid
            - is_disposable (bool): Whether the email is from a disposable domain
            - is_role_account (bool): Whether the email is a role account (e.g., info@, support@)
            - has_mx_records (bool): Whether the domain has valid MX records
            - domain (str): The domain part of the email
            - error (str, optional): Error message if the validation failed
            
    Raises:
        requests.RequestException: If the API request fails
    """
    # Perform basic validation first
    if not is_valid_email(email):
        return {
            "is_valid": False,
            "error": "Invalid email format"
        }
    
    try:
        # API endpoint for email validation
        endpoint = "https://api.jigsawstack.com/v1/email/validate"
        
        # Build query parameters
        params = {"email": sanitize_input(email)}
        
        # Set headers with API key authentication
        headers = {
            "x-api-key": JIGSAWSTACK_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Log the request being made
        app.logger.info(f"Validating email: {email}")
        
        # Make the GET request
        response = requests.get(endpoint, params=params, headers=headers, timeout=10)
        
        # Log response status
        app.logger.info(f"Email validation response status: {response.status_code}")
        
        # Check if response is successful
        if response.status_code == 200:
            validation_result = response.json()
            app.logger.info(f"Email validation result: {validation_result}")
            return validation_result
        else:
            # Handle error responses
            error_message = f"Email validation failed with status code: {response.status_code}"
            app.logger.error(error_message)
            
            # Try to extract error details from response
            try:
                error_details = response.json()
                app.logger.error(f"Error details: {error_details}")
            except:
                error_details = {"message": response.text or "Unknown error"}
                
            return {
                "is_valid": False,
                "error": error_details.get("message", error_message)
            }
            
    except requests.RequestException as e:
        app.logger.error(f"Error validating email: {str(e)}")
        return {
            "is_valid": False,
            "error": f"API request failed: {str(e)}"
        }

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
        'dealPotential': 0.25,  # Increased from 0.3 to 0.25
        'practicality': 0.20,   # Unchanged at 0.2
        'revenue': 0.30,        # Increased from 0.25 to 0.3
        'aiEase': 0.15,         # Unchanged at 0.15
        'difficulty': 0.10      # Unchanged at 0.1
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

@app.route('/api/analyze-lead', methods=['POST'])
def analyze_lead():
    """
    Analyze a lead based on the provided URL and email using JigsawStack's Web Scraper API.
    
    This endpoint first validates the email (if provided) and then analyzes the website.
    
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
        if email:
            app.logger.info(f"Email provided: {email}. Beginning validation...")
            
            # Call our email validation function
            email_validation = validate_email(email)
            
            # If email is not valid, return error
            if not email_validation.get('is_valid', False):
                error_message = email_validation.get('error', 'Email validation failed')
                app.logger.warning(f"Email validation failed: {error_message}")
                
                return jsonify({
                    'message': f"Email validation failed: {error_message}",
                    'validationDetails': email_validation
                }), 400
            
            # Log successful validation
            app.logger.info(f"Email successfully validated: {email}")
            
            # If email is disposable, log a warning but continue
            if email_validation.get('is_disposable', False):
                app.logger.warning(f"Warning: {email} is a disposable email address")
        
        # Proceed with website analysis
        app.logger.info(f"Analyzing URL: {url}")
        
        # Call JigsawStack API with improved error handling
        jigsawstack_url = 'https://api.jigsawstack.com/scrape'
        headers = {
            'Authorization': f'Bearer {JIGSAWSTACK_API_KEY}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json'
        }
        
        # Build payload with options to improve success rate
        payload = {
            'url': url,
            'options': {
                'waitForSelector': 'body',
                'javascript': True,
                'blockedResourceTypes': ['image', 'media', 'font', 'stylesheet'],
                'timeout': 15000  # 15 seconds timeout
            }
        }
        
        # If email was validated, include it in the request for tracking
        if email and email_validation.get('is_valid', False):
            payload['metadata'] = {
                'email': email,
                'validationResult': email_validation
            }
        
        app.logger.info(f"Making request to JigsawStack API: {jigsawstack_url}")
        response = requests.post(
            jigsawstack_url, 
            json=payload, 
            headers=headers, 
            timeout=20  # 20 seconds timeout
        )
        
        # Log response status
        app.logger.info(f"JigsawStack API response status: {response.status_code}")
        
        # Raise exception for non-200 responses
        if response.status_code != 200:
            error_message = f"JigsawStack API error: {response.status_code}"
            app.logger.error(error_message)
            
            try:
                error_details = response.json()
                app.logger.error(f"Error details: {error_details}")
            except:
                error_details = {"message": response.text or "Unknown error"}
                
            return jsonify({
                'message': error_details.get("message", error_message)
            }), response.status_code
        
        # Parse API response
        api_data = response.json()
        scores = api_data.get('scores', {})
        
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
            'insights': api_data.get('insights', []),
            'recommendations': api_data.get('recommendations', [])
        }
        
        # If email was provided and validated, include in response
        if email and email_validation.get('is_valid', False):
            response_data['email'] = {
                'address': email,
                'validation': email_validation
            }
        
        return jsonify(response_data)
        
    except requests.exceptions.RequestException as e:
        app.logger.error(f"JigsawStack API error: {str(e)}")
        return jsonify({
            'message': f'Error connecting to JigsawStack API: {str(e)}'
        }), 500
    except Exception as e:
        app.logger.error(f"Error processing request: {str(e)}")
        return jsonify({
            'message': f'An error occurred while analyzing the lead: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Instructions for deployment:
    # 1. Create a .env file with your JIGSAWSTACK_API_KEY
    # 2. Install dependencies: pip install -r requirements.txt
    # 3. Run locally: python app.py
    # 4. For production deployment (e.g., Heroku):
    #    - Create a Procfile with: web: python app.py
    #    - Set JIGSAWSTACK_API_KEY in environment variables
    app.run(debug=True, host='0.0.0.0', port=5000)