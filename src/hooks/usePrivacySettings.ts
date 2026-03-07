import { useState, useEffect } from 'react';
import type { DataPrivacySettings } from '@/types/data';

const PRIVACY_SETTINGS_KEY = 'analytics-privacy-settings';

const defaultSettings: DataPrivacySettings = {
    maskSensitiveData: true,
    excludeColumns: [],
    anonymizeData: false,
    dataRetentionDays: 30,
    encryptAtRest: true,
};

export function usePrivacySettings() {
    const [privacySettings, setPrivacySettingsState] = useState<DataPrivacySettings>(defaultSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(PRIVACY_SETTINGS_KEY);
            if (stored) {
                setPrivacySettingsState({ ...defaultSettings, ...JSON.parse(stored) });
            }
        } catch {
            // ignore
        }
        setIsLoaded(true);
    }, []);

    const updatePrivacySettings = (updates: Partial<DataPrivacySettings>) => {
        setPrivacySettingsState(prev => {
            const newSettings = { ...prev, ...updates };
            localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(newSettings));
            return newSettings;
        });
    };

    return { privacySettings, updatePrivacySettings, isLoaded };
}
