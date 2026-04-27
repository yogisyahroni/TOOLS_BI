import React, { useEffect } from 'react';
import { useWSEvent } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Info, BellRing } from 'lucide-react';
import { sendDesktopNotification } from '@/lib/desktop';
import { notifications, isMobileNative, haptics } from '@/lib/mobile';
import { useNavigate } from 'react-router-dom';

export function RealtimeNotificationHandler() {
    const { toast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        if (isMobileNative) {
            const initPush = async () => {
                const granted = await notifications.requestPermission();
                if (granted) {
                    const token = await notifications.getToken();
                    console.log('FCM Token:', token);
                }
            };

            initPush();

            // Foreground listener
            const foregroundListener = notifications.addListener('notificationReceived', (event: any) => {
                const { notification } = event;
                toast({
                    title: notification.title || "New Notification",
                    description: notification.body,
                });
                haptics.notification('success');
            });

            // Action listener (Deep Linking)
            const actionListener = notifications.addListener('notificationActionPerformed', (event: any) => {
                const { notification } = event;
                const path = notification.data?.path || notification.data?.url;
                
                if (path) {
                    navigate(path);
                } else if (notification.title?.toLowerCase().includes('alert')) {
                    navigate('/alerts');
                } else {
                    navigate('/dashboard');
                }
            });

            return () => {
                foregroundListener.remove();
                actionListener.remove();
            };
        }
    }, [toast, navigate]);

    // Phase 4: Listen for KPI alert breaches globally
    useWSEvent('kpi_alert_tripped', (payload: any) => {
        toast({
            title: "KPI Alert Breached!",
            description: `${payload.alertName}: Value ${payload.value} (Limit: ${payload.threshold})`,
            variant: "destructive",
        });
        
        sendDesktopNotification(
            "KPI Alert Breached!", 
            `${payload.alertName}: Value ${payload.value} (Limit: ${payload.threshold})`
        ).catch(console.error);

        if (isMobileNative) haptics.notification('error');
    });

    // Handle generic system notifications
    useWSEvent('system_notification', (payload: any) => {
        toast({
            title: payload.title || "System Message",
            description: payload.message,
        });

        sendDesktopNotification(
            payload.title || "System Message",
            payload.message
        ).catch(console.error);

        if (isMobileNative) haptics.notification('success');
    });

    return null;
}

