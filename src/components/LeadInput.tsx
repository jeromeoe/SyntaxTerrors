import React, { useState } from 'react';
import { Search } from 'lucide-react';
import type { LeadInputProps } from '../types';

/**
 * Component for inputting and submitting URLs for lead analysis
 */
export function LeadInput({ onSubmit, isLoading }: LeadInputProps) {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Empty email is valid (optional)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUrl = url.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUrl) {
      setError('Please enter a URL');
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError('Please enter a valid URL');
      return;
    }

    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    onSubmit(trimmedUrl, trimmedEmail);
    setUrl('');
    setEmail('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-1">
            Website URL to analyze
          </label>
          <input
            id="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL, e.g., https://example.com"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
            aria-invalid={!!error}
            aria-describedby={error ? "input-error" : undefined}
          />
        </div>

        <div className="relative">
          <label htmlFor="email-input" className="block text-sm font-medium text-gray-700 mb-1">
            Email (optional)
          </label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email for validation (optional)"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center justify-center gap-2"
          aria-label={isLoading ? "Analyzing website..." : "Analyze website"}
        >
          <Search size={20} aria-hidden="true" />
          <span>{isLoading ? 'Analyzing...' : 'Analyze Lead'}</span>
        </button>
      </div>
      
      {error && (
        <p id="input-error" className="mt-2 text-red-600 text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}