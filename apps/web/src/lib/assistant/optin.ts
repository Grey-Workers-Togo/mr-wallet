/**
 * RG-AP8: using the assistant needs an explicit opt-in. The server persists nothing about the assistant
 * but counters (RG-AP3), so the choice is kept in this browser, per account. Storage can be blocked or
 * empty: an unreadable choice reads as "not opted in", the safe side.
 */
const key = (userId: string) => `mrw.assistant.optin.${userId}`;

export function readOptIn(userId: string): boolean {
  try {
    return window.localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
}

export function writeOptIn(userId: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key(userId), '1');
    else window.localStorage.removeItem(key(userId));
  } catch {
    // Not persisted: the choice holds for this page view only.
  }
}
