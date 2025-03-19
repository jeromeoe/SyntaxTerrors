import React, { useState } from 'react';
import { Search } from 'lucide-react';
import type { LeadInputProps } from '../types';

/**
 * Component for inputting and submitting URLs for lead analysis
 */
export function LeadInput({ onSubmit, isLoading }: LeadInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError('Please enter a valid URL');
      return;
    }

    onSubmit(trimmedUrl);
    setUrl('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="relative">
        <label htmlFor="url-input" className="sr-only">
          Enter website URL to analyze
        </label>
        <input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter website URL to analyze..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isLoading}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : undefined}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2"
          aria-label={isLoading ? "Analyzing website..." : "Analyze website"}
        >
          <Search size={20} aria-hidden="true" />
          <span>{isLoading ? 'Analyzing...' : 'Analyze'}</span>
        </button>
      </div>
      {error && (
        <p id="url-error" className="mt-2 text-red-600 text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}