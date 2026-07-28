/** Tells the service worker to drop the encrypted offline cache and its key (ADR-0008: purged on logout / PIN lockout). */
export async function purgeOfflineCache(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage('purge-cache');
}
