/** RG-SY14 / RG-RE5: per-platform minimum supported client version, driving CLIENT_TOO_OLD. */
export type SyncPlatform = 'WEB' | 'IOS' | 'ANDROID';

/** Pure `x.y.z` comparator — no external semver dependency for three numbers. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isClientVersionSupported(
  clientVersion: string,
  minimumVersion: string,
): boolean {
  return compareVersions(clientVersion, minimumVersion) >= 0;
}
