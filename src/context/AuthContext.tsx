import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAccessToken, setRefreshToken, clearTokens, type UserProfile } from '@/lib/api';

interface AuthContextType {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    loadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const loadMe = async () => {
        setIsLoading(true);
        try {
            // Restore token logic removed: we only rely on the httpOnly cookie now.
            // If the cookie is present, authApi.me() will succeed (directly or via refresh).
            // If not, it fails and clearTokens() is called.

            // If there's no access token, me() will trigger the 401 interceptor 
            // which uses the refresh token cookie!
            const { data } = await authApi.me();
            setUser(data);
            setIsAuthenticated(true);
        } catch {
            clearTokens();
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadMe();
    }, []);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { data } = await authApi.login(email, password);
            setAccessToken(data.accessToken);
            setRefreshToken(data.refreshToken);
            setUser(data.user);
            setIsAuthenticated(true);
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (email: string, password: string, displayName: string) => {
        setIsLoading(true);
        try {
            const { data } = await authApi.register({ email, password, displayName });
            if (data?.accessToken) {
                setAccessToken(data.accessToken);
            }
            if (data?.refreshToken) {
                setRefreshToken(data.refreshToken);
                setUser(data.user);
                setIsAuthenticated(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } finally {
            clearTokens();
            setUser(null);
            setIsAuthenticated(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout, loadMe }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
