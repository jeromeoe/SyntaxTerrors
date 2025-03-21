import { useState, useCallback } from 'react';
import { Brain } from 'lucide-react';
import { LeadInput } from './components/LeadInput';
import { LeadCard } from './components/LeadCard';
import { analyzeLead } from './services/leadAnalyzer';
import type { Lead } from './types';

function App() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const newLead = await analyzeLead(url);
      setLeads(prevLeads => [newLead, ...prevLeads]);
    } catch (error) {
      console.error('Error analyzing lead:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">AI Lead Qualifier</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
            Identify & Qualify High-Potential Business Leads
          </h2>
          <p className="text-gray-600 mb-8 text-center max-w-2xl">
            Enter a website URL to analyze potential business opportunities. Our AI will evaluate
            the lead based on multiple criteria and provide actionable insights.
          </p>
          <LeadInput onSubmit={handleSubmit} isLoading={isLoading} />
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md max-w-2xl w-full" role="alert">
              <h3 className="font-semibold mb-1">Analysis Failed</h3>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>

        {leads.length === 0 && !isLoading && !error && (
          <div className="text-center text-gray-500 mt-12">
            No leads analyzed yet. Enter a URL above to get started.
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            AI Lead Qualifier © {new Date().getFullYear()} | All analyses are for informational
            purposes only
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;