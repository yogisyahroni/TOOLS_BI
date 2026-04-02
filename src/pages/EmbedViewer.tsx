import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { DashboardViewer } from '@/components/DashboardViewer';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function EmbedViewer() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [embedData, setEmbedData] = useState<any>(null);
    const [resourcePayload, setResourcePayload] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEmbedData = async () => {
            try {
                setLoading(true);
                const res = await axios.get(`${API_BASE}/embed/view/${token}`);
                const tokenMeta = res.data;
                setEmbedData(tokenMeta);

                // Story → redirect to StoryPresentation (full-screen, Tableau-style)
                // Pass the token so the presentation page can validate it
                if (tokenMeta.resourceType === 'story') {
                    navigate(
                        `/stories/view/${tokenMeta.resourceId}?token=${token}`,
                        { replace: true }
                    );
                    return;
                }

                if (tokenMeta.resourceData) {
                    setResourcePayload(tokenMeta.resourceData);
                } else {
                    setError('Konfigurasi embed tidak lengkap. Payload resource tidak ditemukan dari response.');
                }
            } catch (err: any) {
                setError(err.response?.data?.error || 'Token embed tidak valid atau sudah kedaluwarsa');
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchEmbedData();
    }, [token, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !embedData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
                <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                <h2 className="text-xl font-bold text-foreground">Erro Embed</h2>
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    const isDashboard = embedData.resourceType === 'dashboard';

    return (
        <div className="w-full h-screen overflow-hidden bg-background relative">
            {embedData.showToolbar ? (
                <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shadow-sm z-10 relative">
                    <span className="font-semibold text-sm text-foreground">
                        {resourcePayload?.name || 'NeuraDash Embed View'}
                    </span>
                    <ThemeToggle />
                </div>
            ) : (
                <div className="fixed bottom-4 right-4 z-50 opacity-40 hover:opacity-100 transition-opacity bg-card rounded-md border border-border shadow-md">
                    <ThemeToggle />
                </div>
            )}
            <div className="p-4 h-[calc(100vh)] overflow-auto">
                {isDashboard && resourcePayload ? (
                    <DashboardViewer dashboard={resourcePayload} token={token!} />
                ) : (
                    <div className="border border-border rounded p-4">
                        <h3 className="font-semibold">Resource Information</h3>
                        <pre className="text-xs text-muted-foreground mt-2">
                            {JSON.stringify(embedData, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
