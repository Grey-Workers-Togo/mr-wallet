'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {categories === null && <p className="text-neutral-600">...</p>}
      {categories?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {categories && categories.length > 0 && (
        <div className="space-y-4">
          {topLevel.map((category) => (
            <Card key={category.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-neutral-900">{resolveName(category)}</h3>
                  <Badge>{tKind(category.kind as never)}</Badge>
                  {category.isSystem && <Badge variant="secondary">{t('system')}</Badge>}
                </div>
                {!category.isSystem && (
                  <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(category.id)}>
                    {t('delete')}
                  </Button>
                )}
              </div>
              {categories.filter((c) => c.parentId === category.id).length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {categories
                    .filter((c) => c.parentId === category.id)
                    .map((child) => (
                      <li key={child.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-900">{resolveName(child)}</span>
                          {child.isSystem && <Badge variant="secondary">{t('system')}</Badge>}
                        </div>
                        {!child.isSystem && (
                          <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(child.id)}>
                            {t('delete')}
                          </Button>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('create')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="kind">{t('kindLabel')}</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as (typeof CATEGORY_KINDS)[number])}>
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tKind(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="parentId">{t('parentLabel')}</Label>
              <Select
                value={parentId || undefined}
                onValueChange={(value) => setParentId(value === '__none__' || value === null ? '' : value)}
              >
                <SelectTrigger id="parentId" className="w-full">
                  <SelectValue placeholder={t('noParent')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('noParent')}</SelectItem>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {resolveName(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">{t('submit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
