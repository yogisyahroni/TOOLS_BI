/**
 * RealtimeClient — WebSocket client with automatic reconnection.
 * Uses exponential backoff + JWT token via query param (browser WS cannot set Auth headers).
 */

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080/ws';
const MAX_RETRIES = 8;
const BASE_DELAY_MS = 1_000;

type EventHandler = (payload: unknown) => void;

interface WSEvent {
    type: string;
    payload: unknown;
}

class RealtimeClient {
    private ws: WebSocket | null = null;
    private retryCount = 0;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private handlers = new Map<string, Set<EventHandler>>();
    private isDestroyed = false;

    connect(token: string) {
        if (this.isDestroyed) return;
        if (this.ws?.readyState === WebSocket.OPEN) return;

        const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.info('[WS] Connected');
            this.retryCount = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const msg: WSEvent = JSON.parse(event.data);
                this.dispatch(msg.type, msg.payload);
                this.dispatch('*', msg); // wildcard listeners
            } catch {
                // ignore malformed frames
            }
        };

        this.ws.onerror = () => {
            console.warn('[WS] Error');
        };

        this.ws.onclose = () => {
            this.ws = null;
            if (!this.isDestroyed) {
                this.scheduleReconnect(token);
            }
        };
    }

    private scheduleReconnect(token: string) {
        if (this.retryCount >= MAX_RETRIES) {
            console.error('[WS] Max retries reached. Giving up.');
            return;
        }
        const delay = Math.min(BASE_DELAY_MS * 2 ** this.retryCount, 30_000);
        this.retryCount++;
        console.info(`[WS] Reconnecting in ${delay}ms (attempt ${this.retryCount})`);
        this.retryTimer = setTimeout(() => this.connect(token), delay);
    }

    disconnect() {
        this.isDestroyed = true;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.ws?.close();
        this.ws = null;
    }

    on(eventType: string, handler: EventHandler): () => void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType)!.add(handler);
        // Return unsubscribe function
        return () => this.handlers.get(eventType)?.delete(handler);
    }

    private dispatch(eventType: string, payload: unknown) {
        this.handlers.get(eventType)?.forEach((h) => {
            try {
                h(payload);
            } catch (err) {
                console.error('[WS] Handler error:', err);
            }
        });
    }
}

// Singleton instance
export const realtimeClient = new RealtimeClient();

// React hook for subscribing to a WS event
import { useEffect } from 'react';

export function useWSEvent(eventType: string, handler: EventHandler) {
    useEffect(() => {
        const unsub = realtimeClient.on(eventType, handler);
        return unsub;
    }, [eventType, handler]);
}
