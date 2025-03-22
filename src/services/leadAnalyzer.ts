import type { Lead } from '../types';

const CONFIG = {
  API_URL: '/api/local-scrape',
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  BACKOFF_FACTOR: 1.5,
  TIMEOUT: 15000,
  // URLs known to cause issues
  PROBLEMATIC_DOMAINS: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com'],
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
      return `Server error: ${response.status} ${response.statusText}`;
    }

    if (isJson && responseText) {
      try {
        const errorData = JSON.parse(responseText) as { message?: string; status?: string };
        return errorData?.message || `Server error: ${response.status} ${response.statusText}`;
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
        return `Invalid JSON response (${response.status}): ${responseText}`;
      }
    } else {
      return `Server error (${response.status}): ${responseText || response.statusText}`;
    }
  } catch (error) {
    console.error('Error processing response:', error);
    return `Server error: ${response.status} ${response.statusText}`;
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
    return false;
  }

  if (!Array.isArray(lead.insights) || !Array.isArray(lead.recommendations)) {
    console.error('Invalid lead data: insights or recommendations not arrays', {
      insights: lead.insights,
      recommendations: lead.recommendations,
    });
    return false;
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
        throw new Error('URL must start with http:// or https://');
      }
    } catch (e) {
      throw new Error('Invalid URL provided. Please enter a valid website URL.');
    }

    // Check for problematic domains
    if (isProblematicDomain(url)) {
      throw new Error('This website cannot be analyzed due to access restrictions. Please try a different URL.');
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
        throw new Error(errorMessage);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
        throw new Error('Invalid response format from server');
      }

      if (!isValidLeadData(data)) {
        console.error('Invalid lead data structure:', data);
        throw new Error('Invalid data structure received from server');
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request timed out after', CONFIG.TIMEOUT, 'ms');
    } else {
      console.error('Lead analysis error:', {
        url,
        retryCount,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }

    const isNetworkError =
      error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
    const isRetryableError =
      isNetworkError ||
      errorMessage.includes('temporarily unavailable') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('Internal Server Error'); // Retry on 500 errors

    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError) {
      console.log(
        `Retrying analysis in ${Math.round(retryDelay)}ms... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`
      );
      await delay(retryDelay);
      return analyzeLead(url, retryCount + 1);
    }

    throw new Error(
      error instanceof Error ? error.message : 'Failed to analyze lead. Please try again later.'
    );
  }
}