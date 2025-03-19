import type { Lead } from '../types';

/**
 * Configuration for the lead analyzer service
 */
const CONFIG = {
  // In production use relative URL, in development use full URL
  API_URL: import.meta.env.PROD 
    ? '/api/analyze-lead'
    : 'http://localhost:5000/api/analyze-lead',
  // Retry configuration
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000, // 1 second initial delay
  // Backoff multiplier (each retry waits longer)
  BACKOFF_FACTOR: 1.5,
  // Request timeout in milliseconds (10 seconds)
  TIMEOUT: 10000
};

/**
 * Delay execution for a specified number of milliseconds
 * @param ms - Number of milliseconds to delay
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Safely parse JSON response text
 * @param responseText - Response text to parse
 * @returns Parsed JSON data or null if parsing fails
 */
async function safeParseJson(responseText: string) {
  try {
    if (!responseText || responseText.trim() === '') {
      throw new Error('Empty response received');
    }
    return JSON.parse(responseText);
  } catch (error) {
    console.error('JSON parsing error:', error);
    return null;
  }
}

/**
 * Extract error message from response
 * @param response - Fetch Response object
 * @returns Extracted error message
 */
async function getErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    
    const responseText = await response.text();
    
    if (isJson && responseText) {
      const errorData = await safeParseJson(responseText);
      return errorData?.message || `Server error: ${response.status} ${response.statusText}`;
    } else {
      return `Server error (${response.status}): ${responseText || response.statusText}`;
    }
  } catch (error) {
    return `Server error: ${response.status} ${response.statusText}`;
  }
}

/**
 * Analyzes a website URL to generate lead insights
 * Uses a server-side proxy to bypass CORS and website blocking
 * 
 * @param url - The website URL to analyze
 * @param retryCount - Current retry attempt (internal use)
 * @returns Promise<Lead> - A promise that resolves to a Lead object
 * @throws Error with user-friendly message if analysis fails
 */
export async function analyzeLead(url: string, retryCount = 0): Promise<Lead> {
  // Calculate current retry delay with exponential backoff
  const retryDelay = retryCount > 0 
    ? CONFIG.INITIAL_RETRY_DELAY * Math.pow(CONFIG.BACKOFF_FACTOR, retryCount - 1)
    : CONFIG.INITIAL_RETRY_DELAY;

  try {
    console.log(`Analyzing website: ${url}${retryCount > 0 ? ` (Retry ${retryCount})` : ''}`);

    // Validate URL before making request
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL provided');
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      // Make request to our server-side proxy (not directly to JigsawStack)
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add custom header to help identify requests from our application
          'X-Client-Application': 'AI-Lead-Qualifier',
        },
        body: JSON.stringify({ 
          url,
          // Pass any additional parameters our backend might need
          clientTimestamp: new Date().toISOString()
        }),
        signal: controller.signal,
      });

      // Log response details for debugging
      console.log('Response status:', response.status);
      console.log('Content-Type:', response.headers.get('content-type'));

      // Handle different types of errors
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);

        // Handle specific HTTP status codes
        switch (response.status) {
          case 429: // Too Many Requests
            throw new Error('Rate limit exceeded. Please try again later.');
          case 404:
            throw new Error('Analysis service not found. Please check your connection.');
          case 503:
            throw new Error('Analysis service is temporarily unavailable.');
          default:
            throw new Error(errorMessage);
        }
      }

      // Parse successful response
      const responseText = await response.text();
      const data = await safeParseJson(responseText);
      
      if (!data) {
        throw new Error('Invalid response format from server');
      }
      
      return data as Lead;
    } finally {
      // Clear timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Format error message for user
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown error occurred';

    // Log detailed error information
    console.error('Lead analysis error:', {
      url,
      retryCount,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });

    // Handle network errors, timeout errors, and specific server errors that should be retried
    const isNetworkError = error instanceof TypeError || 
                          (error instanceof Error && error.name === 'AbortError');
    const isRetryableError = isNetworkError || 
                            errorMessage.includes('temporarily unavailable') ||
                            errorMessage.includes('rate limit') ||
                            errorMessage.includes('timed out');

    // Implement retry logic
    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError) {
      console.log(`Retrying analysis in ${Math.round(retryDelay)}ms...`);
      await delay(retryDelay);
      return analyzeLead(url, retryCount + 1);
    }

    // If we've exhausted retries or it's not a retryable error, throw a user-friendly error
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to analyze lead. Please try again later.'
    );
  }
}