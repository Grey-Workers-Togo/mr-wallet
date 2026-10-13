import { describe, expect, it } from 'vitest';
import { formatBinding, formatMinor, type FormatContext } from '../format';
import { historyFor, plainText, renderTemplate } from '../render';
import type { AssistantAnswer, Binding } from '../types';

const context: FormatContext = {
  locale: 'en-US',
  minorUnitsByCode: { XOF: 0, EUR: 2 },
  periodPhrase: (from, to) => `from ${from} to ${to}`,
};

describe('formatMinor (money never goes through a float)', () => {
  it('formats a currency without minor units as whole units', () => {
    expect(formatMinor('73500', 'XOF', 0, 'en-US')).toBe('73,500 XOF');
  });

  it('formats a currency with two minor units, keeping every digit', () => {
    expect(formatMinor('123456', 'EUR', 2, 'en-US')).toBe('1,234.56 EUR');
    expect(formatMinor('5', 'EUR', 2, 'en-US')).toBe('0.05 EUR');
  });

  it('is exact beyond Number.MAX_SAFE_INTEGER', () => {
    expect(formatMinor('9007199254740993', 'XOF', 0, 'en-US')).toBe('9,007,199,254,740,993 XOF');
    expect(formatMinor('9007199254740993', 'EUR', 2, 'en-US')).toBe('90,071,992,547,409.93 EUR');
  });

  it('keeps the sign of a negative amount', () => {
    expect(formatMinor('-42000', 'XOF', 0, 'en-US')).toBe('-42,000 XOF');
    expect(formatMinor('-5', 'EUR', 2, 'en-US')).toBe('-0.05 EUR');
  });

  it('uses the locale separators', () => {
    expect(formatMinor('123456', 'EUR', 2, 'fr-FR').replace(/\s/g, ' ')).toBe('1 234,56 EUR');
  });
});

describe('formatBinding', () => {
  it('formats each binding type', () => {
    expect(formatBinding({ type: 'percent', basisPoints: 6803 }, context)).toBe('68.03%');
    expect(formatBinding({ type: 'percent', basisPoints: -313 }, context)).toBe('-3.13%');
    expect(formatBinding({ type: 'date', value: '2026-09-05' }, context)).toBe('September 5, 2026');
    expect(formatBinding({ type: 'count', value: 4 }, context)).toBe('4');
    expect(formatBinding({ type: 'period', from: '2026-09-01', to: '2026-09-30' }, context)).toBe(
      'from September 1, 2026 to September 30, 2026',
    );
  });

  it('shows a currency it has no minor units for as whole units rather than guessing', () => {
    expect(formatBinding({ type: 'money', amountMinor: '1500', currency: 'GHS' }, context)).toBe('1,500 GHS');
  });
});

describe('renderTemplate (ADR-0018 §4)', () => {
  const bindings: Record<string, Binding> = {
    'r1.total': { type: 'money', amountMinor: '73500', currency: 'XOF' },
    'r1.period': { type: 'period', from: '2026-09-01', to: '2026-09-30' },
  };

  it('substitutes every placeholder with its formatted binding', () => {
    const segments = renderTemplate('You spent {{r1.total}} {{r1.period}}.', bindings, context);
    expect(plainText(segments)).toBe('You spent 73,500 XOF from September 1, 2026 to September 30, 2026.');
    expect(segments.filter((segment) => segment.kind === 'value')).toHaveLength(2);
  });

  it('never prints a value it was not given: an unknown placeholder stays inert', () => {
    const segments = renderTemplate('Total {{r9.total}}.', bindings, context);
    expect(segments).toContainEqual({ kind: 'missing', name: 'r9.total' });
    expect(plainText(segments)).not.toContain('r9.total');
  });

  it('keeps text without placeholders as it is', () => {
    expect(plainText(renderTemplate('Aucune donnée.', {}, context))).toBe('Aucune donnée.');
  });
});

describe('historyFor (RG-AP2)', () => {
  const template = (text: string): AssistantAnswer => ({
    kind: 'template',
    template: text,
    bindings: { 'r1.total': { type: 'money', amountMinor: '100', currency: 'XOF' } },
    labels: {},
    sources: [],
  });

  it('sends the template, never the text rendered for the user', () => {
    const history = historyFor([{ question: 'How much?', answer: template('You spent {{r1.total}}.') }]);
    expect(history).toEqual([
      { role: 'user', content: 'How much?' },
      { role: 'assistant', content: 'You spent {{r1.total}}.' },
    ]);
    // No value of the answer is in what goes back to the server.
    expect(JSON.stringify(history)).not.toMatch(/100|XOF/);
  });

  it('keeps at most the last six turns', () => {
    const conversation = Array.from({ length: 5 }, (_, index) => ({
      question: `q${index}`,
      answer: template('ok'),
    }));
    const history = historyFor(conversation);
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: 'user', content: 'q2' });
  });

  it('skips a fallback and a refusal, which carry no prose', () => {
    const history = historyFor([
      { question: 'a', answer: { kind: 'fallback', bindings: {}, labels: {}, sources: [] } },
      { question: 'b', answer: { kind: 'declined', code: 'OFF_TOPIC' } },
      { question: 'c', answer: null },
    ]);
    expect(history).toEqual([]);
  });
});
