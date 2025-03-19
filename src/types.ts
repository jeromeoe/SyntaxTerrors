/**
 * Represents a qualified business lead with detailed scoring and insights
 */
export interface Lead {
  /** Unique identifier for the lead */
  id: string;
  /** Website URL of the potential lead */
  url: string;
  /** Name of the company */
  companyName: string;
  /** Score indicating the likelihood of closing a deal (0-100) */
  dealPotential: number;
  /** Score indicating how feasible the implementation would be (0-100) */
  practicality: number;
  /** Score indicating the complexity of implementation (0-100) */
  difficulty: number;
  /** Score indicating potential revenue from the deal (0-100) */
  revenue: number;
  /** Score indicating how easily AI can be integrated (0-100) */
  aiEase: number;
  /** Overall score calculated from individual metrics (0-100) */
  totalScore: number;
  /** Additional scoring details */
  scoringDetails?: {
    /** Weights applied to each metric */
    weights: Record<string, number>;
    /** List of penalties applied */
    penalties: Array<{
      metric: string;
      threshold: number;
      actual: number;
      penaltyFactor: number;
      penaltyValue: number;
    }>;
    /** Raw total score before penalties */
    rawTotal: number;
    /** Total penalty applied */
    totalPenalty: number;
  };
  /** Email information if provided */
  email?: {
    /** The email address */
    address: string;
    /** Email validation results */
    validation: {
      is_valid: boolean;
      is_disposable?: boolean;
      is_role_account?: boolean;
      has_mx_records?: boolean;
      domain?: string;
      error?: string;
    };
  };
  /** Array of key insights about the lead */
  insights: string[];
  /** Array of actionable recommendations */
  recommendations: string[];
}

/**
 * Represents the scoring metrics for a lead
 */
export interface LeadScoring {
  /** Score indicating the likelihood of closing a deal (0-100) */
  dealPotential: number;
  /** Score indicating how feasible the implementation would be (0-100) */
  practicality: number;
  /** Score indicating the complexity of implementation (0-100) */
  difficulty: number;
  /** Score indicating potential revenue from the deal (0-100) */
  revenue: number;
  /** Score indicating how easily AI can be integrated (0-100) */
  aiEase: number;
}

/**
 * Props for the LeadInput component
 */
export interface LeadInputProps {
  /** Callback function to handle URL and optional email submission */
  onSubmit: (url: string, email?: string) => void;
  /** Loading state to disable input during processing */
  isLoading: boolean;
}

/**
 * Props for the LeadCard component
 */
export interface LeadCardProps {
  /** Lead object containing all lead information */
  lead: Lead;
}
