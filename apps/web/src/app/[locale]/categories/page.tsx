'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

const CATEGORY_KINDS = ['EXPENSE', 'INCOME'] as const;

interface Category {
  id: string;
  parentId: string | null;
  name: string | null;
  i18nKey: string | null;
  kind: (typeof CATEGORY_KINDS)[number] | 'TRANSFER';
  isSystem: boolean;
}

export default function CategoriesPage() {
  const t = useTranslations('categories');
  const tKind = useTranslations('categories.kind');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<(typeof CATEGORY_KINDS)[number]>('EXPENSE');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadCategories() {
    const list = await apiClient.get<Category[]>('/categories');
    setCategories(list);
  }

  useEffect(() => {
    loadCategories().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function resolveName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return '';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/categories', { name, kind, parentId: parentId || undefined });
      setName('');
      await loadCategories();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/categories/${id}`);
      await loadCategories();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  const topLevel = categories?.filter((c) => !c.parentId) ?? [];
  const parentOptions = categories?.filter((c) => !c.parentId && c.kind === kind) ?? [];

  return (
    <main>
      <h1>{t('title')}</h1>

      {categories === null && <p>...</p>}
      {categories?.length === 0 && <p>{t('empty')}</p>}
      {categories && categories.length > 0 && (
        <ul>
          {topLevel.map((category) => (
            <li key={category.id}>
              {resolveName(category)} — {tKind(category.kind as never)}
              {category.isSystem && ` (${t('system')})`}
              {!category.isSystem && (
                <button type="button" onClick={() => onDelete(category.id)}>
                  {t('delete')}
                </button>
              )}
              <ul>
                {categories
                  .filter((c) => c.parentId === category.id)
                  .map((child) => (
                    <li key={child.id}>
                      {resolveName(child)}
                      {child.isSystem && ` (${t('system')})`}
                      {!child.isSystem && (
                        <button type="button" onClick={() => onDelete(child.id)}>
                          {t('delete')}
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <h2>{t('create')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {t('nameLabel')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t('kindLabel')}
          <select value={kind} onChange={(e) => setKind(e.target.value as (typeof CATEGORY_KINDS)[number])}>
            {CATEGORY_KINDS.map((value) => (
              <option key={value} value={value}>
                {tKind(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('parentLabel')}
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t('noParent')}</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {resolveName(option)}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
