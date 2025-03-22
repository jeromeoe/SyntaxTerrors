import type { Lead } from '../types';

const CONFIG = {
  API_URL: '/api/local-scrape',
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  BACKOFF_FACTOR: 1.5,
  TIMEOUT: 30000,
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
    if (!contentType?.includes('application/json')) {
      console.error('Invalid content type received:', contentType);
      throw new Error(`Invalid response format: Expected JSON but got ${contentType || 'unknown'}`);
    }
    
    const data = await response.json();
    if (data.message) {
      return data.message;
    }
    
    if (data.error) {
      return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    }
    
    return `Server error (${response.status})`;
  } catch (error) {
    console.error('Error parsing error response:', error);
    if (error instanceof SyntaxError) {
      return 'Server returned invalid JSON';
    }
    return `Server error (${response.status}): ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function isValidLeadData(data: unknown): data is Lead {
  if (!data || typeof data !== 'object') {
    console.error('Invalid response data:', data);
    throw new Error('Invalid response format: Not an object');
  }

  const lead = data as Partial<Lead>;
  const requiredFields = [
    'id', 'url', 'companyName', 'dealPotential', 'practicality',
    'revenue', 'aiEase', 'difficulty', 'totalScore', 'insights',
    'recommendations'
  ];

  const missingFields = requiredFields.filter(field => !lead[field as keyof Lead]);
  if (missingFields.length > 0) {
    console.error('Missing required fields:', missingFields);
    throw new Error(`Invalid response format: Missing fields: ${missingFields.join(', ')}`);
  }

  return true;
}

export async function analyzeLead(url: string, retryCount = 0): Promise<Lead> {
  try {
    if (!url) {
      throw new Error('URL is required');
    }

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('URL must start with http:// or https://');
      }
    } catch {
      throw new Error('Invalid URL format');
    }

    // Check for problematic domains before making the request
    if (isProblematicDomain(url)) {
      throw new Error(
        'This website cannot be analyzed due to access restrictions. Sites like Facebook, Twitter, ' +
        'LinkedIn, and other major platforms block our analyzer. Please try a different URL.'
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      console.info('Sending request to:', CONFIG.API_URL, { url });
      
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      console.info('Received response:', {
        status: response.status,
        contentType: response.headers.get('content-type'),
        statusText: response.statusText
      });

      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        console.error('Invalid content type:', contentType);
        throw new Error(`Invalid response format: Expected JSON but got ${contentType || 'unknown'}`);
      }

      const data = await response.json();
      console.info('Parsed response data:', {
        hasData: !!data,
        dataType: typeof data,
        fields: data ? Object.keys(data) : []
      });

      if (!isValidLeadData(data)) {
        throw new Error('Invalid response format: Missing required fields');
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Lead analysis error:', {
      url,
      retryCount,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : 'Unknown error',
      timestamp: new Date().toISOString()
    });

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Analysis timed out after ${CONFIG.TIMEOUT/1000} seconds`);
    }

    const isRetryableError = 
      error instanceof TypeError || 
      (error instanceof Error && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network request failed') ||
        error.message.includes('Server error')
      ));

    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError) {
      const retryDelay = CONFIG.INITIAL_RETRY_DELAY * Math.pow(CONFIG.BACKOFF_FACTOR, retryCount);
      console.info('Retrying request:', {
        attempt: retryCount + 1,
        maxRetries: CONFIG.MAX_RETRIES,
        delay: retryDelay
      });
      await delay(retryDelay);
      return analyzeLead(url, retryCount + 1);
    }

    throw error;
  }
}