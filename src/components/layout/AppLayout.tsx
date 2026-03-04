import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useGlobalShortcuts } from '@/hooks/use-keyboard-shortcuts';

interface AppLayoutProps {
  children: ReactNode;
}

function ShortcutProvider({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-[280px] min-h-screen transition-all duration-300">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
