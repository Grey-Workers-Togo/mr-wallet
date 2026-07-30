'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

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
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const kindItems = Object.fromEntries(CATEGORY_KINDS.map((value) => [value, tKind(value)]));

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<(typeof CATEGORY_KINDS)[number]>('EXPENSE');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setKind('EXPENSE');
    setParentId('');
    setDialogOpen(true);
  }

  function openEditDialog(category: Category) {
    setEditingId(category.id);
    setName(category.name ?? '');
    setKind(category.kind === 'TRANSFER' ? 'EXPENSE' : category.kind);
    setParentId(category.parentId ?? '');
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (editingId) {
        // kind/parentId are immutable after creation
        await apiClient.patch(`/categories/${editingId}`, { name });
      } else {
        await apiClient.post('/categories', { name, kind, parentId: parentId || undefined });
      }
      setDialogOpen(false);
      await loadCategories();
      toast({ title: editingId ? tCommon('updateSuccessTitle') : tCommon('createSuccessTitle'), variant: 'success' });
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
      await apiClient.delete(`/categories/${id}`);
      await loadCategories();
      toast({ title: tCommon('deleteSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  }

  const topLevel = categories?.filter((c) => !c.parentId) ?? [];
  const parentOptions = categories?.filter((c) => !c.parentId && c.kind === kind) ?? [];
  const parentItems = Object.fromEntries([
    ['__none__', t('noParent')],
    ...parentOptions.map((option) => [option.id, resolveName(option)]),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
        <Button type="button" onClick={openCreateDialog}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {categories === null && <PageLoader />}
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
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(category)}>
                      <Pencil className="size-3.5" />
                      {t('edit')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDelete({ id: category.id, label: resolveName(category) })}
                    >
                      {t('delete')}
                    </Button>
                  </div>
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
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(child)}>
                              <Pencil className="size-3.5" />
                              {t('edit')}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setConfirmDelete({ id: child.id, label: resolveName(child) })}
                            >
                              {t('delete')}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t('edit') : t('create')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name" required>{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="kind" required>{t('kindLabel')}</Label>
              <Select
                items={kindItems}
                value={kind}
                onValueChange={(value) => setKind(value as (typeof CATEGORY_KINDS)[number])}
                disabled={!!editingId}
              >
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
                items={parentItems}
                value={parentId || undefined}
                onValueChange={(value) => setParentId(value === '__none__' || value === null ? '' : value)}
                disabled={!!editingId}
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
            <DialogFooter>
              <Button type="submit" loading={isSubmitting}>
                {editingId ? t('saveChanges') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
