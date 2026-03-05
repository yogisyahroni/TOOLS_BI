/**
 * Auth Store — Zustand
 * Manages logged-in user profile, login/logout logic, and JWT persistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    authApi,
    setAccessToken,
    clearTokens,
    type UserProfile,
} from '@/lib/api';

interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    loadMe: () => Promise<void>;
    setUser: (user: UserProfile) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, _get) => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,

            login: async (email, password) => {
                set({ isLoading: true });
                try {
                    const { data } = await authApi.login(email, password);
                    setAccessToken(data.accessToken);
                    // BUG-07: Refresh token is now in httpOnly cookie set by backend
                    // No need to call setRefreshToken here
                    set({ user: data.user, isAuthenticated: true, isLoading: false });
                } catch (err) {
                    set({ isLoading: false });
                    throw err;
                }
            },

            register: async (email, password, displayName) => {
                set({ isLoading: true });
                try {
                    await authApi.register({ email, password, displayName });
                    set({ isLoading: false });
                } catch (err) {
                    set({ isLoading: false });
                    throw err;
                }
            },

            logout: async () => {
                try {
                    await authApi.logout();
                } finally {
                    clearTokens();
                    set({ user: null, isAuthenticated: false });
                }
            },

            loadMe: async () => {
                set({ isLoading: true });
                try {
                    const { data } = await authApi.me();
                    set({ user: data, isAuthenticated: true, isLoading: false });
                } catch {
                    clearTokens();
                    set({ user: null, isAuthenticated: false, isLoading: false });
                }
            },

            setUser: (user) => set({ user, isAuthenticated: true }),
            clearAuth: () => {
                clearTokens();
                set({ user: null, isAuthenticated: false });
            },
        }),
        {
            name: 'datalens-auth',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);
