import React from 'react';
import {
  BarChart,
  Brain,
  DollarSign,
  PenTool,
  CheckCircle,
  Info,
  Mail,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type { LeadCardProps } from '../types';

const SCORE_WEIGHTS = {
  dealPotential: 0.25,
  practicality: 0.2,
  revenue: 0.3,
  aiEase: 0.15,
  difficulty: 0.1,
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

  const formatUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname !== '/' ? urlObj.pathname : ''}`;
    } catch {
      return url;
    }
  };

  const ScoreItem = ({
    score,
    label,
    icon: Icon,
    weight,
  }: {
    score: number;
    label: string;
    icon: React.ElementType;
    weight: number;
  }) => (
    <div className="flex items-center gap-2" role="group" aria-label={`${label}: ${score}`}>
      <Icon size={20} className={scoreColor(score)} aria-hidden="true" />
      <span className="text-gray-700">
        {label} ({weight * 100}%):
      </span>
      <span className={`font-semibold ${scoreColor(score)}`}>{score}</span>
    </div>
  );

  // Check if we have penalty data to display
  const hasPenalties = lead.scoringDetails?.penalties && lead.scoringDetails.penalties.length > 0;

  return (
    <article className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
      <header className="mb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{lead.companyName}</h3>
        <div className="flex items-center gap-1">
          <a
            href={lead.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 text-sm break-all flex items-center gap-1"
            aria-label={`Visit ${lead.companyName}'s website`}
          >
            {formatUrl(lead.url)}
            <ExternalLink size={14} className="inline-block flex-shrink-0" aria-hidden="true" />
          </a>
        </div>
      </header>

      {lead.usesMockData && (
        <div className="mb-4 bg-amber-50 p-3 rounded flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            This analysis uses simulated data because the website could not be accessed directly.
          </div>
        </div>
      )}

      {lead.email && (
        <div className="mb-4 bg-blue-50 p-3 rounded flex items-start gap-2">
          <Mail size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-blue-900">Email Validated</div>
            <div className="text-xs text-blue-700">{lead.email.address}</div>
            {lead.email.validation.is_disposable && (
              <div className="text-xs text-yellow-600 mt-1">
                Note: This is a disposable email address
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ScoreItem
          score={lead.dealPotential}
          label="Deal Potential"
          icon={BarChart}
          weight={SCORE_WEIGHTS.dealPotential}
        />
        <ScoreItem
          score={lead.practicality}
          label="Practicality"
          icon={PenTool}
          weight={SCORE_WEIGHTS.practicality}
        />
        <ScoreItem
          score={lead.revenue}
          label="Revenue"
          icon={DollarSign}
          weight={SCORE_WEIGHTS.revenue}
        />
        <ScoreItem
          score={lead.aiEase}
          label="AI Ease"
          icon={CheckCircle}
          weight={SCORE_WEIGHTS.aiEase}
        />
        <ScoreItem
          score={lead.difficulty}
          label="Difficulty"
          icon={Brain}
          weight={SCORE_WEIGHTS.difficulty}
        />
      </div>

      <div className="bg-blue-50 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-blue-900 mb-2">Total Score</h4>
        <div className="text-3xl font-bold text-blue-600" role="status">
          {lead.totalScore}/100
        </div>

        {hasPenalties && (
          <div className="mt-2 text-sm text-blue-800">
            <div className="flex items-center gap-1">
              <Info size={16} className="text-blue-700 flex-shrink-0" />
              <span>Score includes penalties for critical metrics below thresholds</span>
            </div>
          </div>
        )}
      </div>

      {hasPenalties && (
        <div className="bg-yellow-50 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-yellow-900 mb-2">Score Penalties</h4>
          <ul className="space-y-2">
            {lead.scoringDetails?.penalties.map((penalty, idx) => (
              <li key={idx} className="text-sm">
                <span className="font-medium">{penalty.metric}:</span> {penalty.actual}
                <span className="text-yellow-700"> (below threshold of {penalty.threshold})</span>
                <div className="text-xs text-gray-700">
                  Applied penalty: {(penalty.penaltyFactor * 100).toFixed(1)}% (
                  {penalty.penaltyValue.toFixed(1)} points)
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <section>
          <h4 className="font-semibold text-gray-900 mb-2">Key Insights</h4>
          <ul className="list-disc list-inside space-y-1" role="list">
            {lead.insights.map((insight, index) => (
              <li key={index} className="text-gray-700">
                {insight}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="font-semibold text-gray-900 mb-2">Recommendations</h4>
          <ul className="list-disc list-inside space-y-1" role="list">
            {lead.recommendations.map((rec, index) => (
              <li key={index} className="text-gray-700">
                {rec}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}