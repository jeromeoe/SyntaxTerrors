import React from 'react';
import { BarChart, Brain, DollarSign, PenTool, CheckCircle } from 'lucide-react';
import type { LeadCardProps } from '../types';

const SCORE_WEIGHTS = {
  dealPotential: 0.3,
  practicality: 0.2,
  revenue: 0.25,
  aiEase: 0.15,
  difficulty: 0.1
} as const;

/**
 * Component for displaying detailed lead information and scoring
 */
export function LeadCard({ lead }: LeadCardProps) {
  const scoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const ScoreItem = ({ 
    score, 
    label, 
    icon: Icon 
  }: { 
    score: number; 
    label: string; 
    icon: React.ElementType;
  }) => (
    <div className="flex items-center gap-2" role="group" aria-label={`${label}: ${score}`}>
      <Icon size={20} className={scoreColor(score)} aria-hidden="true" />
      <span className="text-gray-700">{label} ({(SCORE_WEIGHTS[label.toLowerCase().replace(' ', '')] * 100)}%):</span>
      <span className={`font-semibold ${scoreColor(score)}`}>{score}</span>
    </div>
  );

  return (
    <article className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{lead.companyName}</h3>
        <a 
          href={lead.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 text-sm break-all"
          aria-label={`Visit ${lead.companyName}'s website`}
        >
          {lead.url}
        </a>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ScoreItem score={lead.dealPotential} label="Deal Potential" icon={BarChart} />
        <ScoreItem score={lead.practicality} label="Practicality" icon={PenTool} />
        <ScoreItem score={lead.revenue} label="Revenue" icon={DollarSign} />
        <ScoreItem score={lead.aiEase} label="AI Ease" icon={CheckCircle} />
        <ScoreItem score={lead.difficulty} label="Difficulty" icon={Brain} />
      </div>

      <div className="bg-blue-50 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-blue-900 mb-2">Total Score</h4>
        <div className="text-3xl font-bold text-blue-600" role="status">
          {lead.totalScore}/100
        </div>
      </div>

      <div className="space-y-4">
        <section>
          <h4 className="font-semibold text-gray-900 mb-2">Key Insights</h4>
          <ul className="list-disc list-inside space-y-1" role="list">
            {lead.insights.map((insight, index) => (
              <li key={index} className="text-gray-700">{insight}</li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="font-semibold text-gray-900 mb-2">Recommendations</h4>
          <ul className="list-disc list-inside space-y-1" role="list">
            {lead.recommendations.map((rec, index) => (
              <li key={index} className="text-gray-700">{rec}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}