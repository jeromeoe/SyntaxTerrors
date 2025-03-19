import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeadInput } from '../LeadInput';

describe('LeadInput', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input and button', () => {
    render(<LeadInput onSubmit={mockOnSubmit} isLoading={false} />);
    
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles valid URL submission', () => {
    render(<LeadInput onSubmit={mockOnSubmit} isLoading={false} />);
    
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button');
    
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.click(button);
    
    expect(mockOnSubmit).toHaveBeenCalledWith('https://example.com');
  });

  it('shows error for invalid URL', () => {
    render(<LeadInput onSubmit={mockOnSubmit} isLoading={false} />);
    
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button');
    
    fireEvent.change(input, { target: { value: 'invalid-url' } });
    fireEvent.click(button);
    
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid URL');
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables input and button while loading', () => {
    render(<LeadInput onSubmit={mockOnSubmit} isLoading={true} />);
    
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });
});