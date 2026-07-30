'use client';

import * as React from 'react';

type ToastVariant = 'default' | 'success' | 'destructive';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const TOAST_DURATION_MS = 5000;

let listeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener(toasts);
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast({ title, description, variant = 'default' }: { title: string; description?: string; variant?: ToastVariant }) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, title, description, variant }];
  emit();
  window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  return id;
}

export function useToast() {
  const [state, setState] = React.useState<ToastItem[]>(toasts);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);

  return { toasts: state, dismiss };
}
