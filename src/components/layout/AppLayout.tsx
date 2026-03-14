import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useGlobalShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AppLayoutProps {
  children: ReactNode;
}

function ShortcutProvider({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <ShortcutProvider>
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar/80 backdrop-blur-md border-b border-sidebar-border z-[60] flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white">
                <circle cx="20" cy="20" r="10" fill="currentColor" fillOpacity="0.8" />
              </svg>
            </div>
            <span className="font-bold text-foreground">DataLens</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-muted text-foreground touch-target"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        <Sidebar open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
        
        <main className="lg:ml-[280px] min-h-screen transition-all duration-300 pt-16 lg:pt-0">
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </ShortcutProvider>
  );
}
