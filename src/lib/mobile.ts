import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { Share } from '@capacitor/share';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Mobile Detection & Platform Constants
 */
export const isMobileNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isIOS = Capacitor.getPlatform() === 'ios';

/**
 * Platform Agnostic Desktop Check
 * Since we are in a hybrid codebase (Tauri + Capacitor + Web),
 * we need a reliable way to check if we are on Desktop.
 */
export const isDesktop = isTauri();

/**
 * Secure Storage Interface
 * Bridges Capacitor Preferences (Mobile) and LocalStorage (Web/Desktop fallback)
 * Note: Desktop uses Stronghold via vaultSet/vaultGet in desktop.ts
 */
export const secureStorage = {
    set: async (key: string, value: string) => {
        if (isMobileNative) {
            await Preferences.set({ key, value });
        } else {
            localStorage.setItem(key, value);
        }
    },
    get: async (key: string): Promise<string | null> => {
        if (isMobileNative) {
            const { value } = await Preferences.get({ key });
            return value;
        } else {
            return localStorage.getItem(key);
        }
    },
    remove: async (key: string) => {
        if (isMobileNative) {
            await Preferences.remove({ key });
        } else {
            localStorage.removeItem(key);
        }
    }
};

/**
 * Native Haptics Wrapper
 */
export const haptics = {
    impact: async (style: ImpactStyle = ImpactStyle.Medium) => {
        if (!isMobileNative) return;
        try {
            await Haptics.impact({ style });
        } catch (e) {
            console.warn('Haptics not available', e);
        }
    },
    notification: async (type: any) => {
        if (!isMobileNative) return;
        try {
            await Haptics.notification({ type });
        } catch (e) {
            console.warn('Haptics not available', e);
        }
    },
    vibrate: async () => {
        if (!isMobileNative) return;
        try {
            await Haptics.vibrate();
        } catch (e) {
            console.warn('Haptics not available', e);
        }
    }
};

/**
 * Biometric Authentication
 */
export const biometrics = {
    isAvailable: async (): Promise<boolean> => {
        if (!isMobileNative) return false;
        try {
            const result = await NativeBiometric.isAvailable();
            return result.isAvailable;
        } catch {
            return false;
        }
    },
    getBiometryType: async (): Promise<BiometryType | null> => {
        if (!isMobileNative) return null;
        try {
            const result = await NativeBiometric.isAvailable();
            return result.biometryType;
        } catch {
            return null;
        }
    },
    authenticate: async (reason: string = 'Unlock NeuraDash'): Promise<boolean> => {
        if (!isMobileNative) return false;
        try {
            const available = await NativeBiometric.isAvailable();
            if (!available.isAvailable) return false;

            await NativeBiometric.verifyIdentity({
                reason,
                title: 'Biometric Login',
                subtitle: 'Authenticating your identity',
                description: 'Please authenticate to access your dashboard.',
                negativeButtonText: 'Cancel'
            });
            return true;
        } catch (e) {
            console.error('Biometric authentication failed', e);
            return false;
        }
    }
};

/**
 * Push Notifications (FCM)
 */
export const notifications = {
    requestPermission: async (): Promise<boolean> => {
        if (!isMobileNative) return false;
        try {
            const result = await FirebaseMessaging.requestPermissions();
            return result.receive === 'granted';
        } catch (e) {
            console.error('Push permission request failed', e);
            return false;
        }
    },
    getToken: async (): Promise<string | null> => {
        if (!isMobileNative) return null;
        try {
            const { token } = await FirebaseMessaging.getToken();
            return token;
        } catch (e) {
            console.error('Failed to get FCM token', e);
            return null;
        }
    },
    addListener: (eventName: 'notificationReceived' | 'notificationActionPerformed', callback: (data: any) => void) => {
        if (!isMobileNative) return { remove: () => {} };
        return FirebaseMessaging.addListener(eventName, callback);
    },
    removeAllListeners: async () => {
        if (!isMobileNative) return;
        await FirebaseMessaging.removeAllListeners();
    }
};

/**
 * Privacy Screen Management
 */
export const privacyScreen = {
    enable: async () => {
        if (!isMobileNative) return;
        try {
            await PrivacyScreen.enable();
        } catch (e) {
            console.error('Privacy Screen failed to enable', e);
        }
    },
    disable: async () => {
        if (!isMobileNative) return;
        try {
            await PrivacyScreen.disable();
        } catch (e) {
            console.error('Privacy Screen failed to disable', e);
        }
    }
};

/**
 * Native Sharing
 */
export const nativeShare = async (title: string, text: string, url: string) => {
    if (!isMobileNative) {
        // Fallback to clipboard or web share
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch (e) {
                console.warn('Web share failed', e);
            }
        }
        return;
    }
    try {
        await Share.share({ title, text, url, dialogTitle: 'Share Dashboard' });
    } catch (e) {
        console.error('Native share failed', e);
    }
};
