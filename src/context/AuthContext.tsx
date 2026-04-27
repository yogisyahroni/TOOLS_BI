import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setAccessToken, setRefreshToken, clearTokens, type UserProfile, getAccessToken } from '@/lib/api';
import { realtimeClient } from '@/lib/websocket';
import { biometrics, secureStorage, isMobileNative } from '@/lib/mobile';

interface AuthContextType {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isBiometricSupported: boolean;
    isBiometricEnrolled: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithBiometrics: () => Promise<void>;
    register: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    loadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);

    const loadMe = async () => {
        setIsLoading(true);
        try {
            // Restore token logic: we only rely on the httpOnly cookie or vault token.
            // If the cookie is present, authApi.me() will succeed.
            // If on mobile/desktop, the api.ts interceptor will try vault refresh if me() 401s.
            const { data } = await authApi.me();
            setUser(data);
            setIsAuthenticated(true);
            const token = getAccessToken();
            if (token) realtimeClient.connect(token);
        } catch {
            clearTokens();
            setUser(null);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const initAuth = async () => {
            // Check biometric availability
            const supported = await biometrics.isAvailable();
            setIsBiometricSupported(supported);
            
            const enrolled = await secureStorage.get('biometric_enrolled');
            setIsBiometricEnrolled(enrolled === 'true');

            await loadMe();
        };
        initAuth();
    }, []);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { data } = await authApi.login(email, password);
            setAccessToken(data.accessToken);
            setRefreshToken(data.refreshToken);
            setUser(data.user);
            setIsAuthenticated(true);
            
            // Auto-enroll biometrics if supported but not yet enrolled
            if (isBiometricSupported && !isBiometricEnrolled) {
                await secureStorage.set('biometric_enrolled', 'true');
                setIsBiometricEnrolled(true);
            }

            realtimeClient.connect(data.accessToken);
        } finally {
            setIsLoading(false);
        }
    };

    const loginWithBiometrics = async () => {
        if (!isBiometricSupported || !isBiometricEnrolled) {
            throw new Error('Biometrics not available or not enrolled');
        }

        const success = await biometrics.authenticate('Access NeuraDash');
        if (success) {
            // Trigger loadMe which will attempt to use the refresh token from vault/cookie
            await loadMe();
            if (!isAuthenticated) {
                throw new Error('Biometric authentication failed to restore session');
            }
        } else {
            throw new Error('Biometric authentication failed');
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
                realtimeClient.connect(data.accessToken);
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
            realtimeClient.disconnect();
            setUser(null);
            setIsAuthenticated(false);
            // We keep biometric_enrolled flag so user can re-login with biometrics later
            // unless we want to force full password login after manual logout
        }
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            isAuthenticated, 
            isLoading, 
            isBiometricSupported,
            isBiometricEnrolled,
            login, 
            loginWithBiometrics,
            register, 
            logout, 
            loadMe 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};

