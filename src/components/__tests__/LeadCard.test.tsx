import { render, screen } from '@testing-library/react';
import { LeadCard } from '../LeadCard';
import type { Lead } from '../../types';

describe('LeadCard', () => {
  const mockLead: Lead = {
    id: '123',
    url: 'https://example.com',
    companyName: 'Test Company',
    dealPotential: 85,
    practicality: 75,
    difficulty: 60,
    revenue: 90,
    aiEase: 80,
    totalScore: 78,
    insights: ['Insight 1', 'Insight 2'],
    recommendations: ['Recommendation 1', 'Recommendation 2'],
  };

  it('renders lead information correctly', () => {
    render(<LeadCard lead={mockLead} />);

    expect(screen.getByText('Test Company')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('78/100')).toBeInTheDocument();
  });

  it('displays all scores with correct colors', () => {
    render(<LeadCard lead={mockLead} />);

    const scores = screen.getAllByRole('group');
    expect(scores).toHaveLength(5);

    // Check if high scores (>=80) are green
    const dealPotentialScore = screen.getByLabelText('Deal Potential: 85');
    expect(dealPotentialScore).toHaveClass('text-green-600');
  });

  it('renders insights and recommendations', () => {
    render(<LeadCard lead={mockLead} />);

    expect(screen.getByText('Insight 1')).toBeInTheDocument();
    expect(screen.getByText('Insight 2')).toBeInTheDocument();
    expect(screen.getByText('Recommendation 1')).toBeInTheDocument();
    expect(screen.getByText('Recommendation 2')).toBeInTheDocument();
  });
});