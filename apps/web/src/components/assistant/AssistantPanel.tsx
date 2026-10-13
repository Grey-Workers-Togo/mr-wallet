'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send, WifiOff } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { historyFor } from '@/lib/assistant/render';
import type { FormatContext } from '@/lib/assistant/format';
import { MAX_QUESTION_LENGTH, type AskResponse, type AssistantAnswer } from '@/lib/assistant/types';
import { useCurrencies } from '@/hooks/useCurrencies';
import { useOnline } from '@/hooks/useOnline';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/EmptyState';
import { AnswerView } from './AnswerView';

interface Exchange {
  id: number;
  question: string;
  answer: AssistantAnswer | null;
  /** An API error code, rendered through the `error` namespace. */
  error: string | null;
}

interface AssistantPanelProps {
  /** Questions left today, from `/assistant/status`; `null` until known. */
  remainingToday: number | null;
  onAsked: () => void;
}

/**
 * The conversation lives in this component's memory only (RG-AP1, RG-AP2): nothing is written to
 * storage, the last turns are sent with each question, and leaving the page ends it.
 */
export function AssistantPanel({ remainingToday, onAsked }: AssistantPanelProps) {
  const t = useTranslations('assistant');
  const tError = useTranslations('error');
  const localeCode = useLocale();
  const online = useOnline();
  const currencies = useCurrencies();

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);

  const format = useMemo<FormatContext>(
    () => ({
      locale: localeCode === 'en' ? 'en-US' : 'fr-FR',
      minorUnitsByCode: Object.fromEntries(currencies.map((currency) => [currency.code, currency.minorUnits])),
      periodPhrase: (from, to) => t('periodPhrase', { from, to }),
    }),
    [localeCode, currencies, t],
  );

  const trimmed = question.trim();
  const canSend = online && !pending && trimmed.length > 0 && trimmed.length <= MAX_QUESTION_LENGTH;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    const id = nextId.current++;
    const history = historyFor(exchanges.map(({ question: asked, answer }) => ({ question: asked, answer })));
    setExchanges((current) => [...current, { id, question: trimmed, answer: null, error: null }]);
    setQuestion('');
    setPending(true);

    try {
      const response = await apiClient.post<AskResponse>('/assistant/ask', { question: trimmed, history });
      setExchanges((current) => current.map((item) => (item.id === id ? { ...item, answer: response.answer } : item)));
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setExchanges((current) => current.map((item) => (item.id === id ? { ...item, error: code } : item)));
    } finally {
      setPending(false);
      onAsked();
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {!online && (
        <Alert role="status">
          <WifiOff aria-hidden="true" />
          <AlertDescription>{t('offline')}</AlertDescription>
        </Alert>
      )}

      {exchanges.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {exchanges.map((exchange) => (
            <li key={exchange.id} className="space-y-2">
              <div className="ml-auto max-w-[85%] rounded-lg bg-blue-50 px-3 py-2 text-sm text-neutral-900 dark:bg-blue-500/10 dark:text-neutral-100">
                <span className="sr-only">{t('you')}: </span>
                {exchange.question}
              </div>
              <Card className="max-w-[95%] p-4">
                <span className="sr-only">{t('assistant')}: </span>
                {exchange.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {tError(exchange.error as never)}
                  </p>
                ) : exchange.answer ? (
                  <AnswerView answer={exchange.answer} format={format} />
                ) : (
                  <p className="text-sm text-neutral-500">{t('sending')}</p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="assistant-question" className="sr-only">
          {t('questionLabel')}
        </label>
        <Textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void onSubmit(event as unknown as FormEvent);
            }
          }}
          placeholder={t('questionPlaceholder')}
          maxLength={MAX_QUESTION_LENGTH}
          disabled={!online}
          rows={2}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {remainingToday !== null && t('remaining', { count: remainingToday })}
            {remainingToday !== null && ' · '}
            {t('characters', { count: question.length, max: MAX_QUESTION_LENGTH })}
          </p>
          <Button type="submit" disabled={!canSend}>
            <Send className="size-4" aria-hidden="true" />
            {pending ? t('sending') : t('send')}
          </Button>
        </div>
      </form>
    </div>
  );
}
