'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Info } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatBinding, formatDay, type FormatContext } from '@/lib/assistant/format';
import { EMPTY_NAMES, subjectOf, type EntityNames } from '@/lib/assistant/labels';
import { renderTemplate } from '@/lib/assistant/render';
import type { AssistantAnswer, SourceRef } from '@/lib/assistant/types';

interface NamedEntity {
  id: string;
  name: string | null;
  i18nKey?: string | null;
}

interface AnswerViewProps {
  answer: AssistantAnswer;
  format: FormatContext;
}

/**
 * Names for the fallback table. Only fetched when a fallback is shown: a template answer needs none,
 * since every value in it is a placeholder substituted from the response itself.
 */
function useEntityNames(enabled: boolean, categoryName: (entity: NamedEntity) => string): EntityNames {
  const [names, setNames] = useState<EntityNames>(EMPTY_NAMES);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const toRecord = (list: NamedEntity[], resolve: (entity: NamedEntity) => string) =>
      Object.fromEntries(list.map((entity) => [entity.id, resolve(entity)]).filter(([, name]) => name));
    const plain = (entity: NamedEntity) => entity.name ?? '';

    void Promise.allSettled([
      apiClient.get<NamedEntity[]>('/categories'),
      apiClient.get<NamedEntity[]>('/accounts'),
      apiClient.get<NamedEntity[]>('/budgets'),
      apiClient.get<NamedEntity[]>('/goals'),
    ]).then(([categories, accounts, budgets, goals]) => {
      if (cancelled) return;
      const value = (result: PromiseSettledResult<NamedEntity[]>) => (result.status === 'fulfilled' ? result.value : []);
      setNames({
        categories: toRecord(value(categories), categoryName),
        accounts: toRecord(value(accounts), plain),
        budgets: toRecord(value(budgets), plain),
        goals: toRecord(value(goals), plain),
      });
    });
    return () => {
      cancelled = true;
    };
    // `categoryName` is recreated on each render; the lists are fetched once per fallback shown.
  }, [enabled]);

  return names;
}

function Sources({ sources, format }: { sources: SourceRef[]; format: FormatContext }) {
  const t = useTranslations('assistant');
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2 text-xs text-neutral-500 dark:text-neutral-400">
      <p className="font-medium">{t('sources')}</p>
      <ul className="mt-1 space-y-0.5">
        {sources.map((source, index) => (
          <li key={`${source.tool}-${index}`}>
            {t(`tool.${source.tool}` as never)}
            {source.period && (
              <>
                {' · '}
                {format.periodPhrase(formatDay(source.period.from, format.locale), formatDay(source.period.to, format.locale))}
              </>
            )}
            {source.comparedWith && (
              <>
                {' · '}
                {t('comparedWith')}{' '}
                {format.periodPhrase(
                  formatDay(source.comparedWith.from, format.locale),
                  formatDay(source.comparedWith.to, format.locale),
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One assistant answer: the substituted template, the labelled fallback table, or a refusal (ADR-0018 §3). */
export function AnswerView({ answer, format }: AnswerViewProps) {
  const t = useTranslations('assistant');
  const tCategoryType = useTranslations('category.type');

  const names = useEntityNames(answer.kind === 'fallback', (entity) => {
    if (entity.name) return entity.name;
    return entity.i18nKey ? tCategoryType(entity.i18nKey.replaceAll('.', '_') as never) : '';
  });

  const segments = useMemo(
    () => (answer.kind === 'template' ? renderTemplate(answer.template, answer.bindings, format) : []),
    [answer, format],
  );

  if (answer.kind === 'declined') {
    return (
      <div className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{t(`declined.${answer.code}` as never)}</p>
      </div>
    );
  }

  if (answer.kind === 'fallback') {
    const rows = Object.entries(answer.bindings);
    return (
      <div>
        <div className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{t('fallback.notice')}</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1 pr-3 font-medium">{t('fallback.label')}</th>
                <th className="py-1 pr-3 font-medium">{t('fallback.about')}</th>
                <th className="py-1 text-right font-medium">{t('fallback.value')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, binding]) => {
                const label = answer.labels[name];
                const baseKey = label?.key.replace(/^assistant\./, '');
                const subject = label
                  ? subjectOf(label, names, {
                      locale: format.locale,
                      rankText: (rank) => t('rank', { rank }),
                    })
                  : null;
                return (
                  <tr key={name} className="border-t border-border">
                    <td className="py-1.5 pr-3">{baseKey ? t(baseKey as never) : name}</td>
                    <td className="py-1.5 pr-3 text-neutral-600 dark:text-neutral-400">{subject ?? '—'}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatBinding(binding, format)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Sources sources={answer.sources} format={format} />
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm leading-relaxed text-neutral-900 dark:text-neutral-100">
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={index}>{segment.text}</span>
          ) : segment.kind === 'value' ? (
            <strong key={index} className="font-semibold tabular-nums">
              {segment.text}
            </strong>
          ) : null,
        )}
      </p>
      <Sources sources={answer.sources} format={format} />
    </div>
  );
}
