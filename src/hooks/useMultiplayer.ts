import { useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { useAuthStore } from '@/stores/authStore';
import { getAccessToken, getWsUrl } from '@/lib/api';

export interface CursorState {
    x: number;
    y: number;
    userId: string;
    userName: string;
    color: string;
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

const toBase64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
const fromBase64 = (str: string) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

export function useMultiplayer(dashboardId: string | null) {
    const { user } = useAuthStore();
    const token = getAccessToken();
    const [cursors, setCursors] = useState<Record<string, CursorState>>({});
    const wsRef = useRef<WebSocket | null>(null);

    // Yjs document
    const ydocRef = useRef<Y.Doc>(new Y.Doc());
    const [ydocReady, setYdocReady] = useState(false);

    useEffect(() => {
        if (!dashboardId || !token) return;

        // Build ws URL using getWsUrl to ensure env fallback consistency
        const baseWsUrl = getWsUrl();
        const wsUrl = `${baseWsUrl}?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WS Connected for Multiplayer Room:', dashboardId);
            // Join Room
            ws.send(JSON.stringify({
                type: 'join_room',
                payload: { roomId: dashboardId }
            }));

            // Send initial state/presence
            ws.send(JSON.stringify({
                type: 'presence',
                payload: { x: 0, y: 0, userName: user?.displayName || 'Anonymous', color: COLORS[Math.floor(Math.random() * COLORS.length)] }
            }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'presence' || msg.type === 'cursor_move') {
                    const payload = msg.payload as any;
                    if (payload.userId && payload.userId !== user?.id) {
                        setCursors(prev => ({
                            ...prev,
                            [payload.userId]: {
                                x: payload.x,
                                y: payload.y,
                                userId: payload.userId,
                                userName: payload.userName || prev[payload.userId]?.userName || 'User',
                                color: payload.color || prev[payload.userId]?.color || COLORS[0]
                            }
                        }));
                    }
                } else if (msg.type === 'yjs_update') {
                    const payload = msg.payload as any;
                    if (payload.userId !== user?.id && payload.update) {
                        const update = fromBase64(payload.update);
                        Y.applyUpdate(ydocRef.current, update, 'ws'); // source 'ws' prevents firing our own emit
                    }
                } else if (msg.type === 'delete_comment' || msg.type === 'new_comment') {
                    // Will be handled natively via react-query invalidation or similar mechanism to trigger refresh
                    window.dispatchEvent(new CustomEvent('dashboard_comments_updated'));
                }
            } catch (e) {
                console.error("Failed to parse WS msg", e);
            }
        };

        ws.onerror = (e) => console.error("WS Error", e);
        ws.onclose = () => console.log("WS Closed");

        // Yjs sync
        const handleYjsUpdate = (update: Uint8Array, origin: any) => {
            if (origin !== 'ws' && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'yjs_update',
                    payload: { update: toBase64(update) }
                }));
            }
        };

        ydocRef.current.on('update', handleYjsUpdate);
        setYdocReady(true);

        return () => {
            ydocRef.current.off('update', handleYjsUpdate);
            ws.close();
            setCursors({});
            setYdocReady(false);
        };
    }, [dashboardId, token, user?.id]);

    // Mouse tracking
    useEffect(() => {
        if (!wsRef.current || !dashboardId) return;

        let lastSendTime = 0;
        const throttleMs = 50;

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastSendTime > throttleMs) {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'cursor_move',
                        payload: { x: e.clientX, y: e.clientY }
                    }));
                }
                lastSendTime = now;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [dashboardId]);

    return { cursors, ydoc: ydocRef.current, ydocReady };
}
