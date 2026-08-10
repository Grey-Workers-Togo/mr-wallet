'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export default function TagsPage() {
  const t = useTranslations('tags');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const [tags, setTags] = useState<Tag[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setIsSubmitting(true);
    try {
      await apiClient.post('/tags', { name });
      setName('');
      await loadTags();
      toast({ title: tCommon('createSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setIsDeleting(true);
    try {
      await apiClient.delete(`/tags/${id}`);
      await loadTags();
      toast({ title: tCommon('deleteSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {tags === null && <PageLoader />}
      {tags?.length === 0 && <p className="text-neutral-600 dark:text-neutral-400">{t('empty')}</p>}
      {tags && tags.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <Card key={tag.id} className="p-4 flex items-center justify-between gap-2">
              <span className="text-neutral-900 dark:text-neutral-100">{tag.name}</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete({ id: tag.id, label: tag.name })}
              >
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
              <Label htmlFor="name" required>{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Button type="submit" loading={isSubmitting}>
                {t('submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tConfirm('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tConfirm('deleteDescription', { name: confirmDelete?.label ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tConfirm('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={isDeleting}
              onClick={async () => {
                if (!confirmDelete) return;
                await onDelete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              {tConfirm('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
