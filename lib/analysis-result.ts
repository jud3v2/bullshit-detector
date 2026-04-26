export type RiskLevel = 'faible' | 'moyen' | 'eleve';

export type DetectionResult = {
  score: number;
  risk: RiskLevel;
  explanation: string;
  redFlags: string[];
  suggestion: string;
  debug: DetectionDebug;
};

export type DetectionDebug = {
  analyzedCharacters: number;
  matchedSignals: {
    id: string;
    label: string;
    weight: number;
    matchedText: string;
  }[];
  penalties: {
    matchedSignals: number;
    urlOnly: number;
    upperCasePressure: number;
    excessivePunctuation: number;
    lengthAdjustment: number;
    total: number;
  };
  inputPreview: string;
};
