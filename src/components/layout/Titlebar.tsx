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
      <div className="flex items-center pl-3 gap-2 pointer-events-none" data-tauri-drag-region>
        <div className="w-4 h-4 rounded-full gradient-primary flex items-center justify-center">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 text-white">
            <circle cx="20" cy="20" r="10" fill="currentColor" fillOpacity="0.8" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-foreground/80 tracking-tight">Neuradash</span>
      </div>

      <div className="flex h-full">
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
