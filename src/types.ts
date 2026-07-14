export interface Diagnosis {
  name: string;
  likelihood: 'Low' | 'Medium' | 'High';
  explanation: string;
  matchedSymptoms: string[];
}

export interface SymptomAnalysis {
  symptomsAnalysis: string;
  diagnoses: Diagnosis[];
  remedies: string[];
  healthTips: string[];
  whenToConsult: string[];
  disclaimer: string;
}

export interface OrchestrateTrace {
  timestamp: string;
  message: string;
}

export interface AnalysisResponse {
  success: boolean;
  analysis?: SymptomAnalysis;
  error?: string;
  orchestrateTrace?: OrchestrateTrace[] | null;
  orchestrateKeyMasked?: string;
}

export interface OrchestrateStatus {
  status: 'connected' | 'missing';
  maskedKey: string;
  source: string;
  agentCapabilities: string[];
}
