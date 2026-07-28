export interface MatchableRule {
  matchField: 'DESCRIPTION' | 'PAYEE' | 'EXTERNAL_REF';
  matchType: 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'REGEX';
  matchValue: string;
  minAmountMinor: bigint | null;
  maxAmountMinor: bigint | null;
  accountId: string | null;
}

export interface CandidateTransaction {
  accountId: string;
  amountMinor: bigint;
  description: string;
  payee: string | null;
  externalRef: string | null;
}

function fieldValue(rule: MatchableRule, tx: CandidateTransaction): string {
  switch (rule.matchField) {
    case 'PAYEE':
      return tx.payee ?? '';
    case 'EXTERNAL_REF':
      return tx.externalRef ?? '';
    case 'DESCRIPTION':
    default:
      return tx.description;
  }
}

function textMatches(rule: MatchableRule, value: string): boolean {
  switch (rule.matchType) {
    case 'EQUALS':
      return value.toLowerCase() === rule.matchValue.toLowerCase();
    case 'STARTS_WITH':
      return value.toLowerCase().startsWith(rule.matchValue.toLowerCase());
    case 'ENDS_WITH':
      return value.toLowerCase().endsWith(rule.matchValue.toLowerCase());
    case 'REGEX':
      return new RegExp(rule.matchValue, 'i').test(value);
    case 'CONTAINS':
    default:
      return value.toLowerCase().includes(rule.matchValue.toLowerCase());
  }
}

/** RG-T8: pure predicate — the caller iterates rules ordered by priority and takes the first match. */
export function ruleMatches(rule: MatchableRule, tx: CandidateTransaction): boolean {
  if (rule.accountId && rule.accountId !== tx.accountId) return false;
  if (rule.minAmountMinor !== null && tx.amountMinor < rule.minAmountMinor) return false;
  if (rule.maxAmountMinor !== null && tx.amountMinor > rule.maxAmountMinor) return false;
  return textMatches(rule, fieldValue(rule, tx));
}
