import { createHash } from 'node:crypto';
import type { AssistantAnswer } from './bindings';

/** ADR-0022 §3 */
export const ANSWER_CACHE_TTL_MS = 10 * 60 * 1000;
/** Bounds memory on a single instance; the oldest entry goes first. */
export const ANSWER_CACHE_MAX_ENTRIES = 500;

/** Case, accents' composition and spacing do not make a different question. */
export function normalizeQuestion(question: string): string {
  return question.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface CacheKeyParts {
  userId: string;
  question: string;
  /** Latest `updatedAt` across the user's financial entities: any write changes it (ADR-0022 §3). */
  dataVersion: string;
  /** The user's local date. "This month" means another month tomorrow, whatever the data version. */
  localDate: string;
}

/** Hashed so the cache never holds the text of a question, only an opaque key (RG-AP1, RG-AP6). */
export function cacheKey(parts: CacheKeyParts): string {
  return createHash('sha256')
    .update(JSON.stringify([parts.userId, normalizeQuestion(parts.question), parts.dataVersion, parts.localDate]))
    .digest('hex');
}

/** In-memory, per instance, never persisted. The clock is injectable for tests. */
export class AnswerCache {
  private readonly entries = new Map<string, { expiresAt: number; answer: AssistantAnswer }>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly ttlMs: number = ANSWER_CACHE_TTL_MS,
    private readonly maxEntries: number = ANSWER_CACHE_MAX_ENTRIES,
  ) {}

  get(key: string): AssistantAnswer | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.answer);
  }

  set(key: string, answer: AssistantAnswer): void {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: this.clock() + this.ttlMs, answer: structuredClone(answer) });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
