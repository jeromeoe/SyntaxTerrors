import type { Lead } from '../types';

/**
 * Configuration for the lead analyzer service
 */
const CONFIG = {
  // In production use relative URL, in development use full URL
  API_URL: import.meta.env.PROD ? '/api/analyze-lead' : 'http://localhost:5000/api/analyze-lead',
  // Retry configuration
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000, // 1 second initial delay
  // Backoff multiplier (each retry waits longer)
  BACKOFF_FACTOR: 1.5,
  // Request timeout in milliseconds (15 seconds)
  TIMEOUT: 15000,
};

/**
 * Delay execution for a specified number of milliseconds
 * @param ms - Number of milliseconds to delay
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Safely parse JSON response text
 * @param responseText - Response text to parse
 * @returns Parsed JSON data or null if parsing fails
 */
async function safeParseJson(responseText: string): Promise<unknown | null> {
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
      const errorData = (await safeParseJson(responseText)) as { message?: string } | null;
      return errorData?.message || `Server error: ${response.status} ${response.statusText}`;
    } else {
      return `Server error (${response.status}): ${responseText || response.statusText}`;
    }
  } catch (error) {
    return `Server error: ${response.status} ${response.statusText}`;
  }
}

/**
 * Check if network is available
 * @returns Promise<boolean> - True if network is available
 */
async function checkNetworkConnectivity(): Promise<boolean> {
  try {
    // Make a lightweight request to check connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      await fetch('/health-check', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      return true;
    } catch (error) {
      // If it's not an abort error, network may be available but endpoint doesn't exist
      if (error instanceof Error && error.name !== 'AbortError') {
        return true;
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    return false;
  }
}

/**
 * Analyzes a website URL to generate lead insights
 * Uses a server-side proxy to bypass CORS and website blocking
 *
 * @param url - The website URL to analyze
 * @param email - Optional email for validation
 * @param retryCount - Current retry attempt (internal use)
 * @returns Promise<Lead> - A promise that resolves to a Lead object
 * @throws Error with user-friendly message if analysis fails
 */
export async function analyzeLead(url: string, email?: string, retryCount = 0): Promise<Lead> {
  // Calculate current retry delay with exponential backoff
  const retryDelay =
    retryCount > 0
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

    // Check network connectivity before making the request
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
      throw new Error('Network connectivity issue. Please check your internet connection.');
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      // Prepare request body
      const requestBody: Record<string, unknown> = {
        url,
        // Add timestamp for logging/debugging
        clientTimestamp: new Date().toISOString(),
      };

      // Add email if provided
      if (email) {
        requestBody.email = email;
      }

      // Make request to our server-side proxy (not directly to JigsawStack)
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // Add custom header to help identify requests from our application
          'X-Client-Application': 'AI-Lead-Qualifier',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        // Prevent caching
        cache: 'no-store',
        credentials: 'same-origin',
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
          case 502:
            throw new Error('Bad gateway error. The server might be restarting or unavailable.');
          case 0:
            throw new Error('Connection error. The server is unreachable.');
          default:
            throw new Error(errorMessage);
        }
      }

      // Clone the response for getting text, as response body can only be consumed once
      const responseClone = response.clone();
      const contentType = response.headers.get('content-type');

      // Check content type to determine parsing method
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Unexpected content type: ${contentType}. Expected JSON response.`);
      }

      // Try to parse the response as JSON
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        // Fallback to text parsing if JSON parsing fails
        const responseText = await responseClone.text();
        console.error('JSON parse error, response text:', responseText);
        throw new Error('Invalid JSON response from server');
      }

      if (!data) {
        throw new Error('Empty or invalid response from server');
      }

      // Type guard to ensure data has the right structure
      if (!isValidLeadData(data)) {
        throw new Error('Invalid data structure received from server');
      }

      return data;
    } finally {
      // Clear timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Format error message for user
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Special handling for AbortError (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request timed out after', CONFIG.TIMEOUT, 'ms');
    } else {
      // Log detailed error information
      console.error('Lead analysis error:', {
        url,
        email: email ? '✓ provided' : '✗ not provided',
        retryCount,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }

    // Handle network errors, timeout errors, and specific server errors that should be retried
    const isNetworkError =
      error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
    const isRetryableError =
      isNetworkError ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('Connection error') ||
      errorMessage.includes('Bad gateway error');

    // Implement retry logic
    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError) {
      console.log(
        `Retrying analysis in ${Math.round(retryDelay)}ms... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`
      );
      await delay(retryDelay);
      return analyzeLead(url, email, retryCount + 1);
    }

    // If we've exhausted retries or it's not a retryable error, throw a user-friendly error
    if (retryCount >= CONFIG.MAX_RETRIES) {
      throw new Error(
        `Failed to analyze lead after ${CONFIG.MAX_RETRIES} attempts. Please try again later.`
      );
    } else {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to analyze lead. Please try again later.'
      );
    }
  }
}

/**
 * Type guard to validate the structure of a Lead object
 * @param data - Data to validate
 * @returns True if data has the correct Lead structure
 */
function isValidLeadData(data: unknown): data is Lead {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const lead = data as Partial<Lead>;

  // Check required fields
  return (
    typeof lead.id === 'string' &&
    typeof lead.url === 'string' &&
    typeof lead.companyName === 'string' &&
    typeof lead.dealPotential === 'number' &&
    typeof lead.practicality === 'number' &&
    typeof lead.revenue === 'number' &&
    typeof lead.aiEase === 'number' &&
    typeof lead.difficulty === 'number' &&
    typeof lead.totalScore === 'number' &&
    Array.isArray(lead.insights) &&
    Array.isArray(lead.recommendations)
  );
}
