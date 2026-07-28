import fr from '../messages/fr.json';
import en from '../messages/en.json';

/** RG-L2: fr.json and en.json must expose exactly the same key set, or the build fails. */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return [prefix];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

const frKeys = new Set(flattenKeys(fr));
const enKeys = new Set(flattenKeys(en));

const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));

if (missingInEn.length > 0 || missingInFr.length > 0) {
  if (missingInEn.length > 0) {
    console.error('Missing in en.json:', missingInEn);
  }
  if (missingInFr.length > 0) {
    console.error('Missing in fr.json:', missingInFr);
  }
  process.exit(1);
}

console.log(`i18n key parity OK (${frKeys.size} keys).`);
