import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, AlertCircle } from 'lucide-react';
import { API_BASE } from '@/lib/api';
// We re-use DashboardViewer for rendering the embed dashboard state
import { DashboardViewer } from '@/components/DashboardViewer';

// Optional: If you had a dedicated ChartViewer, you would import it here,
// for now we'll assume dashboards are the primary embed targets.

export default function EmbedViewer() {
    const { token } = useParams<{ token: string }>();
    const [embedData, setEmbedData] = useState<any>(null);
    const [resourcePayload, setResourcePayload] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEmbedData = async () => {
            try {
                setLoading(true);
                // Fetch token metadata and actual payload together
                const res = await axios.get(`${API_BASE}/embed/view/${token}`);
                const tokenMeta = res.data;

                setEmbedData(tokenMeta);

                // Ensure the backend returns the actual resource data, since this is a public unauthenticated route
                if (tokenMeta.resourceData) {
                    setResourcePayload(tokenMeta.resourceData);
                } else {
                    // Note: If backend only sends metadata, it means the API needs an update to send the resource itself.
                    setError("Embed configuration incomplete. The resource payload is missing from the response.");
                }
            } catch (err: any) {
                setError(err.response?.data?.error || 'Invalid or expired embed token');
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchEmbedData();
    }, [token]);

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
                <h2 className="text-xl font-bold text-foreground">Embed Error</h2>
                <p className="text-muted-foreground">{error}</p>
            </div>
        );
    }

    const isDashboard = embedData.resourceType === 'dashboard';

    return (
        <div className="w-full h-screen overflow-hidden bg-background">
            {embedData.showToolbar && (
                <div className="h-12 border-b border-border bg-card flex items-center px-4 shadow-sm z-10 relative">
                    <span className="font-semibold text-sm">{resourcePayload?.name || 'NeuraDash Embed View'}</span>
                </div>
            )}
            <div className="p-4 h-[calc(100vh)] overflow-auto">
                {isDashboard && resourcePayload ? (
                    <DashboardViewer dashboard={resourcePayload} token={token!} />
                ) : (
                    <div className="border border-border rounded p-4">
                        <h3 className="font-semibold">Resource Information</h3>
                        <pre className="text-xs text-muted-foreground mt-2">{JSON.stringify(embedData, null, 2)}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}
