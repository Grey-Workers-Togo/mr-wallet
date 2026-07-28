/** Standard Jaro similarity. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(aLen, bLen) / 2) - 1, 0);
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  return (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3;
}

/** docs/06 §7 level 3: Jaro-Winkler, boosts the score for shared prefixes (max 4 chars). */
export function jaroWinkler(a: string, b: string): number {
  const jaroScore = jaro(a, b);
  let prefixLength = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  while (prefixLength < maxPrefix && a[prefixLength] === b[prefixLength]) {
    prefixLength += 1;
  }
  return jaroScore + prefixLength * 0.1 * (1 - jaroScore);
}
