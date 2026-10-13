/**
 * ADR-0022 §5: `ASSISTANT_ENABLED` plus a per-user allowlist. Empty allowlist = nobody: enabling the
 * flag alone never exposes the assistant to everyone. `*` is the explicit "everyone" of the last stage.
 */
export function parseAllowlist(raw: string): { everyone: boolean; userIds: ReadonlySet<string> } {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return { everyone: entries.includes('*'), userIds: new Set(entries.filter((entry) => entry !== '*')) };
}

export function isAllowed(config: { enabled: boolean; allowlist: string }, userId: string): boolean {
  if (!config.enabled) return false;
  const { everyone, userIds } = parseAllowlist(config.allowlist);
  return everyone || userIds.has(userId);
}
