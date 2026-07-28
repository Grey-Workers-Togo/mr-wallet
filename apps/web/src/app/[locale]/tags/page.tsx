'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export default function TagsPage() {
  const t = useTranslations('tags');
  const tError = useTranslations('error');

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadTags() {
    const list = await apiClient.get<Tag[]>('/tags');
    setTags(list);
  }

  useEffect(() => {
    loadTags().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/tags', { name });
      setName('');
      await loadTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/tags/${id}`);
      await loadTags();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {tags === null && <p>...</p>}
      {tags?.length === 0 && <p>{t('empty')}</p>}
      {tags && tags.length > 0 && (
        <ul>
          {tags.map((tag) => (
            <li key={tag.id}>
              {tag.name}
              <button type="button" onClick={() => onDelete(tag.id)}>
                {t('delete')}
              </button>
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
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
