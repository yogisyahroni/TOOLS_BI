import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    authApi,
    setAccessToken,
    setRefreshToken,
    clearTokens,
    type UserProfile,
} from '@/lib/api';

interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    refreshToken: string | null;

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
            refreshToken: null,

            login: async (email, password) => {
                set({ isLoading: true });
                try {
                    const { data } = await authApi.login(email, password);
                    setAccessToken(data.accessToken);
                    setRefreshToken(data.refreshToken);
                    set({ user: data.user, isAuthenticated: true, refreshToken: data.refreshToken, isLoading: false });
                } catch (err) {
                    set({ isLoading: false });
                    throw err;
                }
            },

            register: async (email, password, displayName) => {
                set({ isLoading: true });
                try {
                    const { data } = await authApi.register({ email, password, displayName });
                    // Optional: auto-login after register logic if the backend returns tokens
                    if (data?.accessToken) {
                        setAccessToken(data.accessToken);
                    }
                    if (data?.refreshToken) {
                        setRefreshToken(data.refreshToken);
                        set({ user: data.user, isAuthenticated: true, refreshToken: data.refreshToken, isLoading: false });
                    } else {
                        set({ isLoading: false });
                    }
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
                    set({ user: null, isAuthenticated: false, refreshToken: null });
                }
            },

            loadMe: async () => {
                set({ isLoading: true });
                try {
                    const { data } = await authApi.me();
                    set({ user: data, isAuthenticated: true, isLoading: false });
                } catch {
                    clearTokens();
                    set({ user: null, isAuthenticated: false, refreshToken: null, isLoading: false });
                }
            },

            setUser: (user) => set({ user, isAuthenticated: true }),
            clearAuth: () => {
                clearTokens();
                set({ user: null, isAuthenticated: false, refreshToken: null });
            },
        }),
        {
            name: 'datalens-auth',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated, refreshToken: state.refreshToken }),
            onRehydrateStorage: () => (state) => {
                // Ensure api.ts intercepts gets the token after hydration
                if (state?.refreshToken) {
                    setRefreshToken(state.refreshToken);
                }
            }
        }
    )
);
