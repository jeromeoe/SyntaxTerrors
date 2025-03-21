import type { Lead } from '../types';

const CONFIG = {
  API_URL: '/api/local-scrape',
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000,
  BACKOFF_FACTOR: 1.5,
  TIMEOUT: 15000,
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    const responseText = await response.text();

    if (isJson && responseText) {
      const errorData = JSON.parse(responseText) as { message?: string; status?: string };
      return errorData?.message || `Server error: ${response.status} ${response.statusText}`;
    } else {
      return `Server error (${response.status}): ${responseText || response.statusText}`;
    }
  } catch (error) {
    return `Server error: ${response.status} ${response.statusText}`;
  }
}

function isValidLeadData(data: unknown): data is Lead {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const lead = data as Partial<Lead>;

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

export async function analyzeLead(url: string, retryCount = 0): Promise<Lead> {
  const retryDelay =
    retryCount > 0
      ? CONFIG.INITIAL_RETRY_DELAY * Math.pow(CONFIG.BACKOFF_FACTOR, retryCount - 1)
      : CONFIG.INITIAL_RETRY_DELAY;

  try {
    console.log(`Analyzing website: ${url}${retryCount > 0 ? ` (Retry ${retryCount})` : ''}`);

    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL provided');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
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

      const data = await response.json();

      if (!isValidLeadData(data)) {
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
      errorMessage.includes('timed out');

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