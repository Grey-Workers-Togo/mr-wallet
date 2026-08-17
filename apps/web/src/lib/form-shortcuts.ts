import type { KeyboardEvent } from 'react';

/** Submits the form on Ctrl+Enter (Cmd+Enter on macOS). Attach to a <form>'s onKeyDown. */
export function submitOnCtrlEnter(e: KeyboardEvent<HTMLFormElement>) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}
