import React, { useState, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import type { LeadInputProps } from '../types';

export function LeadInput({ onSubmit, isLoading }: LeadInputProps) {
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  const validateUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol) && urlObj.hostname.includes('.');
    } catch {
      return false;
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      const trimmedUrl = url.trim();

      if (!trimmedUrl) {
        setError('Please enter a URL');
        return;
      }

      if (!validateUrl(trimmedUrl)) {
        setError('Please enter a valid URL starting with http:// or https://');
        return;
      }

      onSubmit(trimmedUrl);
      setUrl('');
    },
    [url, validateUrl, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-1">
            Website URL to analyze <span className="text-red-500">*</span>
          </label>
          <input
            id="url-input"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Enter website URL, e.g., https://example.com"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
            aria-invalid={!!error}
            aria-describedby={error ? 'input-error' : undefined}
            autoComplete="url"
            required
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-grow bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center justify-center gap-2"
            aria-label={isLoading ? 'Analyzing website...' : 'Analyze website'}
          >
            <Search size={20} aria-hidden="true" />
            <span>{isLoading ? 'Analyzing...' : 'Analyze Lead'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          id="input-error"
          className="mt-2 text-red-600 text-sm flex items-start gap-1"
          role="alert"
        >
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">
        <p>* We analyze websites through our secure local scraping service.</p>
      </div>
    </form>
  );
}