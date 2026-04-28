import React, { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Titlebar() {
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isDesktopEnv, setIsDesktopEnv] = useState(false);

  useEffect(() => {
    // Only run in Tauri environment
    if (!isTauri()) return;
    setIsDesktopEnv(true);

    const appWindow = getCurrentWindow();
    
    // Listen for resize events to update the maximize icon
    const unlisten = appWindow.onResized(async () => {
      setIsWindowMaximized(await appWindow.isMaximized());
    });

    // Check initial state
    appWindow.isMaximized().then(setIsWindowMaximized);

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  if (!isDesktopEnv) return null;

  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "h-8 bg-sidebar/90 backdrop-blur-md border-b border-sidebar-border",
        "flex items-center justify-between select-none fixed top-0 left-0 right-0 z-[100]"
      )}
    >
      <div className="flex items-center px-4 gap-2">
        <img src="/favicon.svg" alt="Logo" className="w-4 h-4" />
        <span className="text-xs font-semibold text-foreground/80 tracking-tight">Neuradash</span>
        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">v0.1.1</span>
      </div>

      <div className="flex h-full" data-tauri-no-drag>
        <button
          className="h-full px-3 inline-flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          onClick={() => appWindow.minimize()}
          title="Minimize"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          className="h-full px-3 inline-flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          onClick={() => appWindow.toggleMaximize()}
          title={isWindowMaximized ? "Restore" : "Maximize"}
        >
          {isWindowMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          className="h-full px-3 inline-flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          onClick={() => appWindow.close()}
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
