import type { Lead } from '../types';

const CONFIG = {
  API_URL: '/api/local-scrape',
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  BACKOFF_FACTOR: 1.5,
  TIMEOUT: 30000, // Increased timeout for website scraping
  // URLs known to cause issues
  PROBLEMATIC_DOMAINS: [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
    'reddit.com', 'linkedin.com', 'tiktok.com', 'pinterest.com',
    'netflix.com', 'amazon.com', 'youtube.com', 'google.com',
    'github.com', 'apple.com', 'walmart.com', 'notion.so'
  ],
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function isProblematicDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return CONFIG.PROBLEMATIC_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    
    let responseText = '';
    try {
      responseText = await response.text();
      console.debug('Raw API Response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      });
    } catch (e) {
      console.error('Failed to read response body:', e);
      return `Server error (${response.status}): Could not read response body`;
    }

    if (isJson && responseText) {
      try {
        const errorData = JSON.parse(responseText) as { 
          message?: string; 
          status?: string;
          error?: string;
          timestamp?: string;
          phase?: string;
        };
        
        // Return a more descriptive error message if available
        if (errorData?.message) {
          return errorData.message;
        }
        
        if (errorData?.error) {
          return `Error: ${errorData.error}`;
        }
        
        return `Server error (${response.status}): Unknown error from server`;
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
        
        // If we can't parse the JSON, return the raw text if it's short enough
        if (responseText.length < 100) {
          return `Server error (${response.status}): ${responseText}`;
        }
        
        return `Server error (${response.status}): Invalid response format`;
      }
    } else {
      // If it's not JSON, use status text or response text for error
      if (response.status === 404) {
        return "API endpoint not found. Please check server configuration.";
      }
      
      if (response.status === 500) {
        return "Server internal error. The scraping process encountered an unexpected problem.";
      }
      
      if (response.status === 502) {
        return "Bad gateway error. The server might be overloaded or restarting.";
      }
      
      if (response.status === 504) {
        return "Gateway timeout. The scraping operation took too long to complete.";
      }
      
      if (responseText.length < 100) {
        return `Server error (${response.status}): ${responseText || response.statusText}`;
      }
      
      return `Server error (${response.status}): ${response.statusText}`;
    }
  } catch (error) {
    console.error('Error processing response:', error);
    return `Error processing server response: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function isValidLeadData(data: unknown): data is Lead {
  if (!data || typeof data !== 'object') {
    console.error('Invalid lead data: not an object', data);
    return false;
  }

  const lead = data as Partial<Lead>;
  const requiredFields = [
    { field: 'id', type: 'string' },
    { field: 'url', type: 'string' },
    { field: 'companyName', type: 'string' },
    { field: 'dealPotential', type: 'number' },
    { field: 'practicality', type: 'number' },
    { field: 'revenue', type: 'number' },
    { field: 'aiEase', type: 'number' },
    { field: 'difficulty', type: 'number' },
    { field: 'totalScore', type: 'number' },
  ];

  const missingFields = requiredFields.filter(
    ({ field, type }) => typeof lead[field as keyof Lead] !== type
  );

  if (missingFields.length > 0) {
    console.error('Invalid lead data: missing or invalid fields', {
      missingFields,
      receivedData: lead,
    });
    
    // Return a more specific error about what fields are missing
    const fieldList = missingFields.map(f => f.field).join(', ');
    throw new Error(`Server returned incomplete data. Missing or invalid fields: ${fieldList}`);
  }

  if (!Array.isArray(lead.insights) || !Array.isArray(lead.recommendations)) {
    console.error('Invalid lead data: insights or recommendations not arrays', {
      insights: lead.insights,
      recommendations: lead.recommendations,
    });
    
    throw new Error('Server returned incorrect data format for insights or recommendations');
  }

  return true;
}

export async function analyzeLead(url: string, retryCount = 0): Promise<Lead> {
  const retryDelay = retryCount > 0
    ? CONFIG.INITIAL_RETRY_DELAY * Math.pow(CONFIG.BACKOFF_FACTOR, retryCount - 1)
    : CONFIG.INITIAL_RETRY_DELAY;

  try {
    console.log(`Analyzing website: ${url}${retryCount > 0 ? ` (Retry ${retryCount})` : ''}`);

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must start with http:// or https:// (e.g., https://example.com)');
      }
    } catch (e) {
      throw new Error('Invalid URL format. Please check the URL and try again.');
    }

    // Check for problematic domains
    if (isProblematicDomain(url)) {
      throw new Error(
        'This website cannot be analyzed due to access restrictions. Sites like Facebook, Twitter, ' +
        'LinkedIn, and other major platforms block our analyzer. Please try a different URL.'
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      console.debug('Making API request:', {
        url: CONFIG.API_URL,
        method: 'POST',
        body: { url },
      });

      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        
        // Add more context to the error message based on status code
        if (response.status === 422) {
          throw new Error(`Website access blocked: ${errorMessage}`);
        } else if (response.status === 504) {
          throw new Error(`Website took too long to respond: ${errorMessage}`);
        } else if (response.status === 400) {
          throw new Error(`Invalid request: ${errorMessage}`);
        } else if (response.status >= 500) {
          throw new Error(`Website analysis failed: ${errorMessage}`);
        } else {
          throw new Error(errorMessage);
        }
      }

      // Check content type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Invalid content type received:', contentType);
        throw new Error('Invalid JSON format received: Server did not return JSON content type');
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
        throw new Error('Error processing server response: Invalid JSON format received');
      }

      try {
        if (!isValidLeadData(data)) {
          console.error('Invalid lead data structure:', data);
          throw new Error('Server returned invalid data structure. Analysis could not be completed.');
        }
      } catch (error) {
        // isValidLeadData might throw specific validation errors
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Server returned invalid data structure. Analysis could not be completed.');
      }

      return data as Lead;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request timed out after', CONFIG.TIMEOUT, 'ms');
      throw new Error(`Analysis timed out after ${CONFIG.TIMEOUT/1000} seconds. The website might be too large or slow to respond.`);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    console.error('Lead analysis error:', {
      url,
      retryCount,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    const isNetworkError = error instanceof TypeError;
    const isServerError = errorMessage.includes('500') || 
                          errorMessage.includes('502') || 
                          errorMessage.includes('503') ||
                          errorMessage.includes('Internal Server Error');
    
    const isRetryableError = isNetworkError || 
                             isServerError ||
                             errorMessage.includes('timeout') || 
                             errorMessage.includes('timed out');

    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError) {
      console.log(
        `Retrying analysis in ${Math.round(retryDelay)}ms... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`
      );
      await delay(retryDelay);
      return analyzeLead(url, retryCount + 1);
    }

    if (isNetworkError) {
      throw new Error(
        'Unable to connect to the analysis server. Please check your internet connection and try again.'
      );
    }
    
    if (isServerError && retryCount >= CONFIG.MAX_RETRIES) {
      throw new Error(
        `Analysis server is experiencing issues after ${CONFIG.MAX_RETRIES} attempts. Please try again later.`
      );
    }

    // If we get here, pass through the original error
    throw error;
  }
}