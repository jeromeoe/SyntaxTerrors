import type { Lead } from '../types';

const API_URL = 'http://localhost:5000/api/analyze-lead';

/**
 * Simulates the analysis of a website URL to generate lead insights
 * In a production environment, this would integrate with actual API endpoints
 * @param url - The website URL to analyze
 * @returns Promise<Lead> - A promise that resolves to a Lead object
 */
export async function analyzeLead(url: string): Promise<Lead> {
  try {
    console.log(`Analyzing website: ${url}`);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to analyze lead');
    }

    return await response.json();
  } catch (error) {
    console.error('Error analyzing lead:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while analyzing the lead.');
  }
}