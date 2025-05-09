export interface TranscriptItem {
  speaker: 'user' | 'interviewer' | 'ai';
  text: string;
  timestamp: number;
}

export interface AISuggestion {
  suggestion: string;
  rationale?: string; // Changed from improvementAreas
}

export interface InterviewQuestion {
  id: string;
  text: string;
}

export interface PracticeSessionQuestion extends InterviewQuestion {
  userAnswer?: string;
  feedback?: AISuggestion;
}

export interface StoredInterviewSession {
  id: string;
  mode: 'practice' | 'live';
  date: string; // ISO string
  roleDescription?: string; // For practice mode
  transcript: TranscriptItem[]; // Main conversation log
  // userSpokenResponses removed as live mode is simplified
  summary?: string; // AI summary of the session
  overallFeedback?: string; // AI feedback
}

export type AudioStatus = "idle" | "recording" | "processing" | "stopped";

export type AudioSourceType = 'microphone' | 'display';
