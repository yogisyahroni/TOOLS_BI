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
      className={cn(
        "h-10 w-full flex items-center justify-between select-none fixed top-0 left-0 right-0 z-[100] border-b border-white/5 bg-background/80 backdrop-blur-md"
      )}
    >
      {/* AREA GESER ABSOLUT (SULTAN DRAG) */}
      <div 
        className="absolute inset-0 z-0" 
        data-tauri-drag-region 
      />

      <div className="relative z-10 flex items-center px-4 gap-2 pointer-events-none">
        <img src="/favicon.svg" alt="Logo" className="w-4 h-4" />
        <div className="flex flex-col leading-none">
          <span className="text-xs font-bold text-foreground/90 tracking-tight">Neuradash</span>
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">Sentinel v0.1.6</span>
        </div>
      </div>

      <div className="relative z-20 flex h-full items-center" data-tauri-no-drag>
        <button
          className="h-full px-4 flex items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200"
          onClick={() => appWindow.minimize()}
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          className="h-full px-4 flex items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200"
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
