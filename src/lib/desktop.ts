import { invoke, isTauri } from '@tauri-apps/api/core';
export const isDesktop = () => isTauri();
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Stronghold, Client } from '@tauri-apps/plugin-stronghold';

let strongholdInstance: Stronghold | null = null;
let strongholdClient: Client | null = null;

async function initStronghold() {
    if (!isTauri()) return null;
    if (strongholdClient) return { stronghold: strongholdInstance!, client: strongholdClient };

    try {
        const vaultPath = '.sentinel_vault.hold';
        // Securely fetch or generate master key from OS Keychain
        const vaultPassword = await invoke<string>('get_master_key');
        const stronghold = await Stronghold.load(vaultPath, vaultPassword);
        
        let client: Client;
        const clientName = 'neuradash_client';
        try {
            client = await stronghold.loadClient(clientName);
        } catch {
            client = await stronghold.createClient(clientName);
        }

        strongholdInstance = stronghold;
        strongholdClient = client;
        return { stronghold, client };
    } catch (e) {
        console.error("Failed to initialize Stronghold vault", e);
        return null;
    }
}

export async function vaultSet(key: string, value: string) {
    const ctx = await initStronghold();
    if (ctx) {
        const store = ctx.client.getStore();
        const data = Array.from(new TextEncoder().encode(value));
        await store.insert(key, data);
        await ctx.stronghold.save();
    } else {
        localStorage.setItem(key, value);
    }
}

export async function vaultGet(key: string): Promise<string | null> {
    const ctx = await initStronghold();
    if (ctx) {
        const store = ctx.client.getStore();
        try {
            const data = await store.get(key);
            if (data) {
                return new TextDecoder().decode(new Uint8Array(data));
            }
        } catch (e) {
            // Key might not exist
        }
        return null;
    }
    return localStorage.getItem(key);
}

export async function vaultDelete(key: string) {
    const ctx = await initStronghold();
    if (ctx) {
        const store = ctx.client.getStore();
        try {
            await store.remove(key);
            await ctx.stronghold.save();
        } catch (e) {
            // Ignore
        }
    } else {
        localStorage.removeItem(key);
    }
}

export async function requestNotificationPermission() {
    if (!isTauri()) return false;
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
    }
    return permissionGranted;
}

export async function sendDesktopNotification(title: string, body: string) {
    if (!isTauri()) return;
    const granted = await requestNotificationPermission();
    if (granted) {
        sendNotification({ title, body });
    }
}

export async function setTrayStatus(status: 'Optimal' | 'Warning' | 'Critical') {
    if (!isTauri()) return;
    try {
        await invoke('set_sentinel_status', { status });
    } catch (e) {
        console.error("Failed to update tray status", e);
    }
}

export async function openDetachedWindow(label: string, title: string, path: string) {
    if (!isTauri()) {
        window.open(path, '_blank');
        return;
    }
    try {
        await invoke('open_detached_window', { label, title, url: path });
    } catch (e) {
        console.error("Failed to open detached window", e);
    }
}

export async function checkForUpdates() {
    if (!isTauri()) return;
    try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
            console.log(`Update available: ${update.version}`);
            await update.downloadAndInstall();
            // Optional: Notify user or restart automatically
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
        }
    } catch (e) {
        console.error("Update check failed", e);
    }
}

