/**
 * ADR-0016 §2: the model never sees an internal identifier. It receives `c1: Transport`, `a1: Flooz`
 * and answers with aliases; the server maps them back.
 */

export interface AliasEntry {
  id: string;
  name: string;
}

const MAX_LABEL_LENGTH = 40;

/**
 * Names are user-entered and end up in the prompt (ADR-0019 sends them on purpose). Control
 * characters and line breaks are the cheapest way to smuggle an instruction, so they are flattened
 * and the length is bounded.
 */
export function sanitizeLabel(name: string): string {
  const flattened = name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...flattened].slice(0, MAX_LABEL_LENGTH).join('').trim();
}

export class AliasMapper {
  private readonly aliasById = new Map<string, string>();
  private readonly idByAlias = new Map<string, string>();
  private readonly labels: { alias: string; name: string }[] = [];

  /** Aliases are assigned in (name, id) order so they are stable between two questions on unchanged data. */
  constructor(
    readonly prefix: string,
    entries: readonly AliasEntry[],
  ) {
    const ordered = [...entries].sort((a, b) =>
      a.name === b.name ? (a.id < b.id ? -1 : 1) : a.name < b.name ? -1 : 1,
    );
    ordered.forEach((entry, index) => {
      const alias = `${prefix}${index + 1}`;
      this.aliasById.set(entry.id, alias);
      this.idByAlias.set(alias, entry.id);
      this.labels.push({ alias, name: sanitizeLabel(entry.name) });
    });
  }

  aliasFor(id: string): string | undefined {
    return this.aliasById.get(id);
  }

  /** Undefined for an alias the server never handed out — the tool answers with an error, never guesses. */
  resolve(alias: string): string | undefined {
    return this.idByAlias.get(alias);
  }

  /** What is sent to the provider: alias and sanitized display name, nothing else. */
  describe(): readonly { alias: string; name: string }[] {
    return this.labels;
  }

  get aliases(): string[] {
    return this.labels.map((label) => label.alias);
  }
}
