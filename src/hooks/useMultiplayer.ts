import { useEffect, useState, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useAuth } from '@/context/AuthContext';
import { getWsUrl } from '@/lib/api';

export interface CursorState {
    x: number;
    y: number;
    userId: string;
    userName: string;
    color: string;
    lastSeen: number;
}

export interface AwarenessState {
    user: {
        id: string;
        name: string;
        color: string;
        cursor?: { x: number; y: number };
        selection?: any;
    };
}

const COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

export function useMultiplayer(dashboardId: string | null) {
    const { user } = useAuth();
    const [cursors, setCursors] = useState<Record<string, CursorState>>({});
    const [awareness, setAwareness] = useState<Record<string, AwarenessState>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [ydocReady, setYdocReady] = useState(false);

    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const awarenessRef = useRef<any>(null);

    // Initialize Yjs document
    useEffect(() => {
        if (!dashboardId || !user) return;

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        // Use y-websocket for production, or your custom WS
        const wsUrl = getWsUrl().replace('ws://', 'wss://');
        const provider = new WebsocketProvider(
            wsUrl,
            `dashboard-${dashboardId}`,
            ydoc
        );
        providerRef.current = provider;

        // Awareness setup
        awarenessRef.current = provider.awareness;

        const userColor = COLORS[Math.floor(Math.random() * COLORS.length)];

        provider.awareness.setLocalState({
            user: {
                id: user.id,
                name: user.displayName || 'Anonymous',
                color: userColor,
            },
        });

        // Connection status
        provider.on('status', (event: { status: string }) => {
            setIsConnected(event.status === 'connected');
        });

        // Sync status
        provider.on('sync', (isSynced: boolean) => {
            setYdocReady(isSynced);
        });

        // Awareness change handler
        const handleAwarenessChange = () => {
            const states = Array.from(provider.awareness.getStates().entries());
            const newAwareness: Record<string, AwarenessState> = {};
            const newCursors: Record<string, CursorState> = {};

            states.forEach(([clientId, state]: [number, any]) => {
                if (state.user && state.user.id !== user.id) {
                    newAwareness[state.user.id] = state;

                    if (state.user.cursor) {
                        newCursors[state.user.id] = {
                            x: state.user.cursor.x,
                            y: state.user.cursor.y,
                            userId: state.user.id,
                            userName: state.user.name,
                            color: state.user.color,
                            lastSeen: Date.now(),
                        };
                    }
                }
            });

            setAwareness(newAwareness);
            setCursors(newCursors);
        };

        provider.awareness.on('change', handleAwarenessChange);

        return () => {
            provider.awareness.off('change', handleAwarenessChange);
            provider.destroy();
            ydoc.destroy();
            ydocRef.current = null;
            providerRef.current = null;
        };
    }, [dashboardId, user]);

    // Cursor tracking with throttling
    useEffect(() => {
        if (!providerRef.current || !dashboardId) return;

        let lastUpdate = 0;
        const throttleMs = 50; // 20fps max

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastUpdate < throttleMs) return;

            lastUpdate = now;

            const localState = providerRef.current?.awareness.getLocalState();
            if (localState) {
                providerRef.current.awareness.setLocalState({
                    ...localState,
                    user: {
                        ...localState.user,
                        cursor: { x: e.clientX, y: e.clientY },
                    },
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [dashboardId]);

    // Selection tracking
    const updateSelection = useCallback((selection: any) => {
        if (!providerRef.current) return;

        const localState = providerRef.current.awareness.getLocalState();
        if (localState) {
            providerRef.current.awareness.setLocalState({
                ...localState,
                user: {
                    ...localState.user,
                    selection,
                },
            });
        }
    }, []);

    // Get shared data
    const getSharedMap = useCallback((name: string): Y.Map<any> | null => {
        return ydocRef.current?.getMap(name) || null;
    }, []);

    const getSharedArray = useCallback((name: string): Y.Array<any> | null => {
        return ydocRef.current?.getArray(name) || null;
    }, []);

    // Undo/Redo manager
    const undoManager = useRef<Y.UndoManager | null>(null);

    const initUndoManager = useCallback((type: Y.AbstractType<any>) => {
        undoManager.current = new Y.UndoManager(type);
    }, []);

    const undo = useCallback(() => {
        undoManager.current?.undo();
    }, []);

    const redo = useCallback(() => {
        undoManager.current?.redo();
    }, []);

    return {
        cursors,
        awareness,
        isConnected,
        ydocReady,
        ydoc: ydocRef.current,
        updateSelection,
        getSharedMap,
        getSharedArray,
        initUndoManager,
        undo,
        redo,
    };
}