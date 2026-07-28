const CANDIDATE_DELIMITERS = [';', ',', '\t', '|'];

/** docs/06 §3: delimiter chosen by the most regular column count across the first sample lines. */
export function detectDelimiter(sampleLines: string[]): string {
  let best = ';';
  let bestScore = -1;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => line.split(delimiter).length);
    if (counts.some((c) => c < 2)) continue;
    const first = counts[0];
    const consistent = counts.every((c) => c === first);
    const score = consistent ? first! : 0;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** docs/06 §3: UTF-8 BOM stripped explicitly — Buffer→string decoding assumes UTF-8/Windows-1252 upstream. */
export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/** docs/06 §3: first non-numeric line whose cells are distinct textual labels. */
export function detectHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const nonEmpty = row.filter((cell) => cell.trim().length > 0);
    const allText = nonEmpty.every((cell) => Number.isNaN(Number(cell.replace(',', '.'))));
    const distinct = new Set(nonEmpty.map((c) => c.trim().toLowerCase())).size === nonEmpty.length;
    if (allText && distinct && nonEmpty.length >= 2) {
      return i;
    }
  }
  return 0;
}
