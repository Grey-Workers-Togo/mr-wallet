import { z } from 'zod';
import { MAX_HISTORY_TURNS } from '../assistant.orchestrator';

/** RG-AP2 / lot A1: a question of at most 500 characters, at most the last 6 turns of history. */
export const MAX_QUESTION_LENGTH = 500;
const MAX_TURN_LENGTH = 2000;

const turnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    /** A question as typed; an answer as its template (`{{r1.total}}`), never the rendered text. */
    content: z.string().trim().min(1).max(MAX_TURN_LENGTH),
  })
  .strict();

export const askSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    history: z.array(turnSchema).max(MAX_HISTORY_TURNS).default([]),
  })
  .strict();

export type AskDto = z.infer<typeof askSchema>;
