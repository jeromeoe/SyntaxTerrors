import React, { useState, useCallback } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import type { LeadInputProps } from '../types';

/**
 * Component for inputting and submitting URLs for lead analysis
 */
export function LeadInput({ onSubmit, isLoading }: LeadInputProps) {
  const [url, setUrl] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showEmailInput, setShowEmailInput] = useState<boolean>(false);

  const validateUrl = useCallback((url: string): boolean => {
    try {
      // Use strict URL validation
      const urlObj = new URL(url);
      // Additional checks for valid URL
      return ['http:', 'https:'].includes(urlObj.protocol) && urlObj.hostname.includes('.');
    } catch {
      return false;
    }
  }, []);

  const validateEmail = useCallback((email: string): boolean => {
    if (!email) return true; // Empty email is valid (optional)

    // More comprehensive email regex
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(email)) {
      return false;
    }

    // Additional check for domain with at least one dot
    const parts = email.split('@');
    return parts.length === 2 && parts[1].includes('.');
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      // Sanitize inputs by trimming
      const trimmedUrl = url.trim();
      const trimmedEmail = email.trim();

      if (!trimmedUrl) {
        setError('Please enter a URL');
        return;
      }

      if (!validateUrl(trimmedUrl)) {
        setError('Please enter a valid URL starting with http:// or https://');
        return;
      }

      if (trimmedEmail && !validateEmail(trimmedEmail)) {
        setError('Please enter a valid email address');
        return;
      }

      // Only pass email if it's provided and valid
      onSubmit(trimmedUrl, trimmedEmail.length > 0 ? trimmedEmail : undefined);

      // Reset form after submission
      setUrl('');
      setEmail('');
    },
    [url, email, validateUrl, validateEmail, onSubmit]
  );

  const toggleEmailInput = useCallback(() => {
    setShowEmailInput(prev => !prev);
    if (showEmailInput) {
      setEmail(''); // Clear email when hiding the input
    }
  }, [showEmailInput]);

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

        {showEmailInput && (
          <div className="relative">
            <label htmlFor="email-input" className="block text-sm font-medium text-gray-700 mb-1">
              Email (optional)
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email for validation (optional)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>
        )}

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

          <button
            type="button"
            onClick={toggleEmailInput}
            className="text-gray-700 border border-gray-300 px-4 py-3 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {showEmailInput ? 'Hide Email Field' : 'Add Email (Optional)'}
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
        <p>
          * We validate website data through our secure proxy server. No API keys are exposed in
          your browser.
        </p>
        <p>* Optional email is used for additional lead validation and analysis.</p>
      </div>
    </form>
  );
}
