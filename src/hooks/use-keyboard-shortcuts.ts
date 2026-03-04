import { useEffect, useCallback } from 'react';

type ShortcutHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    for (const s of shortcuts) {
      const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = s.alt ? e.altKey : !e.altKey;

      if (e.key.toLowerCase() === s.key.toLowerCase() && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        s.handler();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useGlobalShortcuts() {
  const shortcuts: Shortcut[] = [
    { key: '/', ctrl: true, handler: () => { window.location.href = '/ask-data'; }, description: 'Ask Data (AI)' },
    { key: 'u', ctrl: true, handler: () => { window.location.href = '/upload'; }, description: 'Upload Data' },
    { key: 'e', ctrl: true, handler: () => { window.location.href = '/explorer'; }, description: 'Data Explorer' },
    { key: 'b', ctrl: true, shift: true, handler: () => { window.location.href = '/chart-builder'; }, description: 'Chart Builder' },
    { key: 'd', ctrl: true, shift: true, handler: () => { window.location.href = '/dashboard-builder'; }, description: 'Dashboard Builder' },
  ];

  useKeyboardShortcuts(shortcuts);
  return shortcuts;
}
