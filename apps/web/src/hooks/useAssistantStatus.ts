import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { AssistantStatus } from '@/lib/assistant/types';

/**
 * `GET /assistant/status`: whether the assistant is open for this account and how many questions are
 * left today. `null` while loading or when the server cannot be reached — the assistant then simply
 * does not show, and nothing else in the app is affected.
 */
export function useAssistantStatus() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiClient.get<AssistantStatus>('/assistant/status'));
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loaded, refresh };
}
