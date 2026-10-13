/**
 * Shape of `POST /assistant/ask` (docs/05-api.md §Assistant, ADR-0018 §3). Mirrored here rather than
 * imported: an app never imports from another app (RG-RE1).
 */

export type Binding =
  | { type: 'money'; amountMinor: string; currency: string }
  | { type: 'percent'; basisPoints: number }
  | { type: 'period'; from: string; to: string }
  | { type: 'count'; value: number }
  | { type: 'date'; value: string };

/** A stable i18n key plus parameters — never prose. */
export interface BindingLabel {
  key: string;
  params?: Record<string, string | number>;
}

export interface SourceRef {
  tool: string;
  period?: { from: string; to: string };
  comparedWith?: { from: string; to: string };
}

export type DeclineCode = 'WRITE_REQUEST' | 'FINANCIAL_ADVICE' | 'OFF_TOPIC';

export type AssistantAnswer =
  | {
      kind: 'template';
      template: string;
      bindings: Record<string, Binding>;
      labels: Record<string, BindingLabel>;
      sources: SourceRef[];
    }
  | { kind: 'fallback'; bindings: Record<string, Binding>; labels: Record<string, BindingLabel>; sources: SourceRef[] }
  | { kind: 'declined'; code: DeclineCode };

export interface AskResponse {
  answer: AssistantAnswer;
}

export interface AssistantStatus {
  enabled: boolean;
  /** The user accepted the assistant (RG-AP8); recorded on the server, not in this browser. */
  optedIn: boolean;
  dailyQuota: number;
  remainingToday: number;
}

/**
 * What goes back to the server as history (RG-AP2): the question as typed, and an answer as the template
 * the server gave (`{{r1.total}}`) — never the text rendered for the user, which carries values.
 */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** The server accepts at most this many turns (RG-AP2). */
export const MAX_HISTORY_TURNS = 6;
export const MAX_QUESTION_LENGTH = 500;
