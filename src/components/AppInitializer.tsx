import { useEffect } from "react";
import { isMobileNative, privacyScreen } from "@/lib/mobile";
import { isDesktop, checkForUpdates, setTrayStatus } from "@/lib/desktop";
import { StatusBar, Style } from '@capacitor/status-bar';
import { useTheme } from "./ThemeProvider";
import { RealtimeNotificationHandler } from "./realtime/RealtimeNotificationHandler";
import { Toaster } from "./ui/toaster";
import { Toaster as Sonner } from "./ui/sonner";

/**
 * AppInitializer handles platform-specific initializations
 * and UI components that require context (Theme, Auth, etc.)
 */
export function AppInitializer() {
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    // ─── Desktop Initialization ──────────────────────────────────────────────
    if (isDesktop()) {
      checkForUpdates();
      setTrayStatus('Optimal');
    }
    
    // ─── Mobile Initialization ───────────────────────────────────────────────
    if (isMobileNative) {
      // Privacy Screen (Prevents snapshots in task switcher)
      privacyScreen.enable().catch(console.error);
      
      // Status Bar Initialization (Overlay for edge-to-edge feel)
      const initStatusBar = async () => {
        try {
          await StatusBar.setOverlaysWebView({ overlay: true });
        } catch (e) {
          console.warn('StatusBar overlay failed', e);
        }
      };
      initStatusBar();
    }
  }, []);

  // Sync StatusBar with Theme changes
  useEffect(() => {
    if (isMobileNative) {
      const activeTheme = theme === 'system' ? systemTheme : theme;
      const updateStatusBar = async () => {
        try {
          await StatusBar.setStyle({
            style: activeTheme === 'dark' ? Style.Dark : Style.Light
          });
        } catch (e) {
          console.warn('StatusBar style update failed', e);
        }
      };
      updateStatusBar();
    }
  }, [theme, systemTheme]);

  return (
    <>
      <RealtimeNotificationHandler />
      <Toaster />
      <Sonner />
    </>
  );
}
