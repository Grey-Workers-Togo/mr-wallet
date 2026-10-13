import { describe, expect, it } from 'vitest';
import { EMPTY_NAMES, subjectOf, type EntityNames } from '../labels';

const names: EntityNames = {
  categories: { 'cat-1': 'Transport' },
  accounts: { 'acc-1': 'Flooz' },
  budgets: { 'bud-1': 'Courses' },
  goals: {},
};
const context = { locale: 'en-US', rankText: (rank: number) => `No. ${rank}` };

describe('subjectOf', () => {
  it('names the entity from the ids the client already holds', () => {
    expect(subjectOf({ key: 'k', params: { categoryId: 'cat-1', rank: 1 } }, names, context)).toBe('Transport');
    expect(subjectOf({ key: 'k', params: { accountId: 'acc-1' } }, names, context)).toBe('Flooz');
    expect(subjectOf({ key: 'k', params: { budgetId: 'bud-1', rank: 2 } }, names, context)).toBe('Courses');
  });

  it('prefers the transaction description for an expense', () => {
    expect(subjectOf({ key: 'k', params: { description: 'Taxi', categoryId: 'cat-1', rank: 1 } }, names, context)).toBe('Taxi');
  });

  it('falls back to the rank when the name is not known', () => {
    expect(subjectOf({ key: 'k', params: { goalId: 'goal-9', rank: 3 } }, names, context)).toBe('No. 3');
    expect(subjectOf({ key: 'k', params: { categoryId: 'cat-1', rank: 1 } }, EMPTY_NAMES, context)).toBe('No. 1');
  });

  it('formats a month, and shows a currency', () => {
    expect(subjectOf({ key: 'k', params: { month: '2026-09' } }, names, context)).toBe('September 2026');
    expect(subjectOf({ key: 'k', params: { currency: 'XOF' } }, names, context)).toBe('XOF');
  });

  it('has no subject when the label carries nothing', () => {
    expect(subjectOf({ key: 'k' }, names, context)).toBeNull();
  });
});
