'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && <Alert variant="error">{tError(error as never)}</Alert>}

      {tags === null && <p className="text-neutral-600">...</p>}
      {tags?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {tags && tags.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <Card key={tag.id} className="p-4 flex items-center justify-between gap-2">
              <span className="text-neutral-900">{tag.name}</span>
              <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(tag.id)}>
                {t('delete')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('create')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Button type="submit">{t('submit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
