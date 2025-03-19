import { Lead } from '../types';

/**
 * JigsawStack API Service
 * 
 * This service provides a wrapper around JigsawStack API functionality.
 * It's designed to interface with our backend proxy which handles the actual API calls
 * to JigsawStack, providing better security by not exposing API keys in the frontend.
 */

// Configuration for the JigsawStack service
const CONFIG = {
  // Base API URL - uses the backend proxy
  API_URL: import.meta.env.PROD ? '/api' : 'http://localhost:5000/api',
  // Request timeout in milliseconds (15 seconds)
  TIMEOUT: 15000,
};

/**
 * Perform email validation through the backend proxy
 * 
 * @param email - Email address to validate
 * @returns Promise with validation results
 */
export async function validateEmail(email: string): Promise<{
  is_valid: boolean;
  is_disposable?: boolean;
  is_role_account?: boolean;
  has_mx_records?: boolean;
  domain?: string;
  error?: string;
}> {
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      const response = await fetch(`${CONFIG.API_URL}/validate-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Email validation failed');
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Email validation request timed out');
    }
    throw error;
  }
}

/**
 * Analyze a website URL to generate lead insights using JigsawStack's AI web scraper
 * 
 * @param url - The website URL to analyze
 * @param email - Optional email for additional validation
 * @returns Promise with Lead data
 */
export async function analyzeWebsite(url: string, email?: string): Promise<Lead> {
  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      // Prepare request body
      const requestBody: Record<string, unknown> = {
        url,
        clientTimestamp: new Date().toISOString(),
      };

      // Add email if provided
      if (email) {
        requestBody.email = email;
      }

      // Make request to our backend proxy
      const response = await fetch(`${CONFIG.API_URL}/analyze-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Client-Application': 'AI-Lead-Qualifier',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || `Error: ${response.status}`;
        } catch {
          errorMessage = errorText || `Error: ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Website analysis request timed out');
    }
    throw error;
  }
}

/**
 * Check the health status of the JigsawStack service backend
 * 
 * @returns Promise with status information
 */
export async function checkServiceHealth(): Promise<{ status: string; timestamp: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${CONFIG.API_URL}/health-check`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Service health check failed: ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Health check timed out');
    }
    throw error;
  }
}