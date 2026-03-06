import React, { useState } from 'react';
import {
    Database,
    CreditCard,
    ShoppingCart,
    BarChart,
    Cloud,
    Github,
    Hexagon,
    Search,
    Plus,
    RefreshCw,
    CheckCircle2,
    XCircle,
    AlertCircle
} from 'lucide-react';
import { useConnectorCatalog, useActiveConnectors, useSetupConnector, useSyncConnector } from '@/hooks/useApi';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from '@/components/ui/label';

// Map icon names to Lucide components
const IconMap: Record<string, React.FC<any>> = {
    Database,
    CreditCard,
    ShoppingCart,
    BarChart,
    Cloud,
    Github,
    Hexagon,
};

export default function DataConnectors() {
    const { data: catalog, isLoading: isCatalogLoading } = useConnectorCatalog();
    const { data: activeConnections, isLoading: isActiveLoading } = useActiveConnectors();
    const setupConnector = useSetupConnector();
    const syncConnector = useSyncConnector();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSource, setSelectedSource] = useState<any | null>(null);
    const [credentials, setCredentials] = useState<Record<string, string>>({});

    const filteredCatalog = catalog?.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSetup = async () => {
        if (!selectedSource) return;

        try {
            await setupConnector.mutateAsync({
                sourceId: selectedSource.sourceDefinitionId,
                credentials
            });
            toast.success(`${selectedSource.name} connected successfully`);
            setSelectedSource(null);
            setCredentials({});
        } catch (error: any) {
            toast.error(error.message || 'Failed to connect');
        }
    };

    const handleSync = async (connectionId: string) => {
        try {
            await syncConnector.mutateAsync(connectionId);
            toast.success('Sync triggered successfully');
        } catch (error: any) {
            toast.error('Failed to trigger sync');
        }
    };

    return (
        <div className="flex h-full flex-col gap-6 p-6 overflow-hidden">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Data Connectors</h1>
                <p className="text-muted-foreground">
                    Connect and sync data from external databases, APIs, and SaaS applications.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left Panel: Catalog */}
                <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search connectors..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 pb-4">
                        {isCatalogLoading ? (
                            <div className="flex justify-center p-8">
                                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredCatalog?.map((source) => {
                                    const Icon = IconMap[source.icon] || Database;
                                    return (
                                        <Card key={source.sourceDefinitionId} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedSource(source)}>
                                            <CardHeader className="p-4 pb-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="p-2 bg-primary/10 rounded-md">
                                                        <Icon className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <Badge variant="outline" className="text-xs font-normal">
                                                        Airbyte
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-4 pt-2">
                                                <CardTitle className="text-base">{source.name}</CardTitle>
                                                <CardDescription className="text-xs line-clamp-2 mt-1">
                                                    Connect and sync sync data from {source.name} automatically.
                                                </CardDescription>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}

                        {filteredCatalog?.length === 0 && (
                            <div className="text-center p-8 text-muted-foreground">
                                No connectors found matching "{searchQuery}"
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Active Connections */}
                <div className="flex flex-col gap-4 overflow-hidden bg-muted/30 p-4 rounded-xl border">
                    <h2 className="text-lg font-semibold flex items-center justify-between">
                        <span>Active Connections</span>
                        <Badge variant="secondary">{activeConnections?.length || 0}</Badge>
                    </h2>

                    <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                        {isActiveLoading ? (
                            <div className="flex justify-center p-4">
                                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : activeConnections?.length === 0 ? (
                            <div className="text-center p-6 border border-dashed rounded-lg bg-background">
                                <Database className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                                <p className="text-sm font-medium">No active connections</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Select a connector from the catalog to get started.
                                </p>
                            </div>
                        ) : (
                            activeConnections?.map((conn) => {
                                const isSyncing = conn.syncStatus === 'syncing';
                                const isSuccess = conn.syncStatus === 'succeeded';
                                const isFailed = conn.syncStatus === 'failed';

                                return (
                                    <Card key={conn.connectionId} className="shadow-sm">
                                        <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                                            <div>
                                                <CardTitle className="text-sm font-medium">{conn.sourceName}</CardTitle>
                                                <CardDescription className="text-xs mt-0.5 font-mono">
                                                    ID: {conn.connectionId.substring(0, 8)}...
                                                </CardDescription>
                                            </div>
                                            {isSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                            {isSyncing && <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />}
                                            {isFailed && <XCircle className="h-4 w-4 text-red-500" />}
                                        </CardHeader>
                                        <CardContent className="p-4 pt-2">
                                            <div className="flex items-center justify-between">
                                                <Badge variant={isSuccess ? "default" : isSyncing ? "secondary" : "destructive"} className="text-[10px] capitalize">
                                                    {conn.syncStatus}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs px-2"
                                                    onClick={() => handleSync(conn.connectionId)}
                                                    disabled={isSyncing || syncConnector.isPending}
                                                >
                                                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Setup Modal */}
            <Dialog open={!!selectedSource} onOpenChange={(open) => !open && setSelectedSource(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Connect {selectedSource?.name}</DialogTitle>
                        <DialogDescription>
                            Configure the credentials to connect to {selectedSource?.name}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="apiKey">API Key / Access Token</Label>
                            <Input
                                id="apiKey"
                                type="password"
                                placeholder="sk_live_..."
                                value={credentials['apiKey'] || ''}
                                onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1 text-orange-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                This is a mock implementation. Any credential will work.
                            </p>
                        </div>

                        {/* Conditional fields based on source type (mocked) */}
                        {['postgres', 'mysql'].includes(selectedSource?.sourceDefinitionId) && (
                            <div className="grid gap-2">
                                <Label htmlFor="host">Host</Label>
                                <Input
                                    id="host"
                                    placeholder="localhost"
                                    value={credentials['host'] || ''}
                                    onChange={(e) => setCredentials({ ...credentials, host: e.target.value })}
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedSource(null)}>Cancel</Button>
                        <Button
                            onClick={handleSetup}
                            disabled={setupConnector.isPending || (!credentials['apiKey'] && !credentials['host'])}
                        >
                            {setupConnector.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                            Save & Test
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
