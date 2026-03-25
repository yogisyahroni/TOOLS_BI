import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Database, Plus, Trash2, Play, RefreshCw, Code2, CheckCircle,
    XCircle, Loader2, ChevronDown, ChevronUp, Shield, Zap,
    Globe, Server, Search, RefreshCcw, CheckCircle2, LayoutGrid
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, connectionApi, type DBConnection, type ConnectionCreate } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ─── DB type icons & colours ──────────────────────────────────────────────────
const DB_META: Record<string, { color: string; emoji: string }> = {
    postgresql: { color: '#336791', emoji: '🐘' },
    supabase: { color: '#3ECF8E', emoji: '⚡' },
    neon: { color: '#00e593', emoji: '🟢' },
    cockroachdb: { color: '#6933FF', emoji: '🪳' },
    timescaledb: { color: '#FDB515', emoji: '⏱' },
    mysql: { color: '#f0932b', emoji: '🐬' },
    mariadb: { color: '#C0765A', emoji: '🦭' },
    planetscale: { color: '#000000', emoji: '🪐' },
    mssql: { color: '#CC2927', emoji: '🏢' },
    'azure-sql': { color: '#0079D7', emoji: '☁️' },
    sqlite: { color: '#8CB4FF', emoji: '📁' },
    clickhouse: { color: '#FFCC01', emoji: '🖱' },
    webhook: { color: '#E91E63', emoji: '🪝' },
};

const dbMeta = (type: string) => DB_META[type.toLowerCase()] ?? { color: '#6366f1', emoji: '🗄' };

// ─── Types returned by /connections/types ────────────────────────────────────
interface DBTypeInfo {
    id: string;
    label: string;
    defaultPort: number;
    icon: string;
    note?: string;
}

interface TableInfo {
    tableName: string;
    tableType: string;
    schemaName: string;
    rowCount: number;
    columns: { name: string; type: string }[];
}

// ─── Hooks ───────────────────────────────────────────────────────────────────
// ─── DB Types hook — uses api instance (token from memory, NOT localStorage) ───
function useDBTypes() {
    return useQuery<DBTypeInfo[]>({
        queryKey: ['db-types'],
        // BUG-C2 FIX: use api.get() with interceptor-injected Bearer token
        // instead of raw fetch + localStorage.getItem('access_token')
        queryFn: () =>
            api.get<{ data: DBTypeInfo[] }>('/connections/types')
                .then((r) => r.data.data),
        staleTime: Infinity,
    });
}

function useConnections() {
    return useQuery<DBConnection[]>({
        queryKey: ['connections'],
        queryFn: () => connectionApi.list().then(r => r.data.data),
    });
}

function useConnectionSchema(connectionId: string | null) {
    return useQuery<TableInfo[]>({
        queryKey: ['connection-schema', connectionId],
        queryFn: () => connectionApi.schema(connectionId!).then((r: any) => r.data.data),
        enabled: !!connectionId && connectionId !== 'webhook',
    });
}

// ─── Webhook Details Component ───────────────────────────────────────────────
function WebhookDetails({ connId }: { connId: string }) {
    const { data, isLoading } = useQuery({
        queryKey: ['webhook-token', connId],
        queryFn: () => connectionApi.token(connId)
    });

    if (isLoading) return <Loader2 className="w-4 h-4 animate-spin mt-2 text-muted-foreground" />;

    const baseUrl = window.location.origin;

    return (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg text-xs space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">Webhook Endpoint Configuration:</p>
            <div className="flex flex-col gap-1">
                <span><strong>URL:</strong></span>
                <code className="px-2 py-1 bg-background border border-border rounded truncate select-all">
                    {baseUrl}/api/v1/webhooks/{connId}
                </code>
            </div>
            <div className="flex flex-col gap-1">
                <span><strong>Authorization Header:</strong></span>
                <code className="px-2 py-1 bg-background border border-border rounded truncate select-all">
                    Bearer {data?.token}
                </code>
            </div>
            <p className="italic pt-2">Send a POST request with a JSON array or object. The table schema will be inferred automatically from the first payload.</p>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ConnectionsPage() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const { data: conns = [], isLoading } = useConnections();

    const [showForm, setShowForm] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [queryConnId, setQueryConnId] = useState<string | null>(null);
    const [sqlDraft, setSqlDraft] = useState('SELECT 1');
    const [queryResult, setQueryResult] = useState<{ columns: string[]; data: Record<string, unknown>[]; durationMs: number } | null>(null);
    const [showSchemaDialog, setShowSchemaDialog] = useState(false);
    const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
    const { data: schema, isLoading: isLoadingSchema } = useConnectionSchema(selectedConnection);

    // ── Create mutation ──
    const createMut = useMutation({
        mutationFn: (payload: ConnectionCreate) => connectionApi.create(payload).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['connections'] });
            setShowForm(false);
            toast({ title: 'Connection saved!' });
        },
        onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
    });

    // ── Delete mutation ──
    const deleteMut = useMutation({
        mutationFn: (id: string) => connectionApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['connections'] });
            toast({ title: 'Connection removed' });
        },
        onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
    });

    // ── Create Dataset mutation ──
    const createDatasetMut = useMutation({
        mutationFn: ({ id, tableName, schemaName }: { id: string; tableName: string; schemaName: string }) =>
            connectionApi.createDataset(id, { tableName, schemaName }),
        onSuccess: (data) => {
            toast({ title: `Dataset ${data.name} created successfully` });
            qc.invalidateQueries({ queryKey: ['datasets'] }); // Assuming a 'datasets' query key
        },
        onError: (err: any) => {
            const errorMessage = err.response?.data?.error || err.message || 'Failed to create dataset';
            toast({ title: 'Create Dataset failed', description: errorMessage, variant: 'destructive' });
        },
    });

    // ── Test connection ──
    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await connectionApi.test(id);
            if (res.status === 'success' || res.status === 'ok' || res.status === 'connected') {
                toast({ title: 'Connected successfully!', description: `Latency: ${res.latencyMs}ms` });
            } else {
                toast({ title: 'Connection failed', description: res.message || 'Check credentials', variant: 'destructive' });
            }
        } catch (e: any) {
            toast({ title: 'Connection test failed', description: e.message, variant: 'destructive' });
        } finally {
            setTestingId(null);
        }
    };

    // ── Sync schema ──
    const handleSync = async (id: string) => {
        setSyncingId(id);
        try {
            await connectionApi.sync(id);
            qc.invalidateQueries({ queryKey: ['connections'] });
            qc.invalidateQueries({ queryKey: ['connection-schema', id] }); // Invalidate schema for this connection
            toast({ title: 'Schema synced!' });
        } catch (e: any) {
            toast({ title: 'Schema sync failed', description: e.message, variant: 'destructive' });
        } finally {
            setSyncingId(null);
        }
    };

    // ── Query ──
    const handleQuery = async (id: string) => {
        try {
            const res = await connectionApi.query(id, { sql: sqlDraft, limit: 200 });
            setQueryResult({ columns: res.columns, data: res.data, durationMs: res.rowCount });
        } catch (e: any) {
            toast({ title: 'Query failed', description: e.message, variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-8 pb-16">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
                            <Globe className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">External Databases</h1>
                            <p className="text-muted-foreground text-sm">Connect any database in the world — Supabase, MySQL, PostgreSQL, ClickHouse &amp; more</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Add Connection
                    </button>
                </div>
            </motion.div>

            {/* DB Type featured chips */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                className="flex flex-wrap gap-3">
                {Object.entries(DB_META).map(([id, meta]) => (
                    <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border bg-card text-muted-foreground">
                        <span>{meta.emoji}</span>
                        <span className="capitalize">{id}</span>
                    </span>
                ))}
            </motion.div>

            {/* Connections list */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : conns.length === 0 ? (
                <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
                    <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-xl font-semibold text-foreground">No connections yet</p>
                    <p className="text-muted-foreground text-sm mt-1 mb-6">Connect Supabase, PostgreSQL, MySQL, MSSQL, ClickHouse…</p>
                    <button onClick={() => setShowForm(true)} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition">
                        Add Connection
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {conns.map((conn, i) => {
                        const meta = dbMeta(conn.dbType);
                        const expanded = expandedId === conn.id;
                        const isQueryOpen = queryConnId === conn.id;
                        return (
                            <motion.div key={conn.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                {/* Card header stripe */}
                                <div className="h-1.5 w-full" style={{ background: meta.color }} />

                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl bg-muted">
                                                {meta.emoji}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground">{conn.name}</p>
                                                <p className="text-xs text-muted-foreground capitalize">
                                                    {conn.dbType === 'webhook' ? 'Push-based Integration' : `${conn.dbType} · ${conn.host}:${conn.port}`}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={() => deleteMut.mutate(conn.id)}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {conn.dbType !== 'webhook' && (
                                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                            <Server className="w-3.5 h-3.5" />
                                            <span>{conn.databaseName}</span>
                                            <span className="mx-1">·</span>
                                            <Shield className="w-3.5 h-3.5" />
                                            <span>{conn.sslMode}</span>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {conn.dbType !== 'webhook' && (
                                            <button onClick={() => handleTest(conn.id)} disabled={testingId === conn.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 transition disabled:opacity-50">
                                                {testingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                Test
                                            </button>
                                        )}

                                        {conn.dbType !== 'webhook' && (
                                            <button onClick={() => handleSync(conn.id)} disabled={syncingId === conn.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition disabled:opacity-50">
                                                {syncingId === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                Sync Schema
                                            </button>
                                        )}

                                        {conn.dbType !== 'webhook' && (
                                            <button onClick={() => { setQueryConnId(isQueryOpen ? null : conn.id); setQueryResult(null); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition">
                                                <Code2 className="w-3.5 h-3.5" />
                                                Query
                                            </button>
                                        )}

                                        {conn.dbType !== 'webhook' && (
                                            <button onClick={() => { setSelectedConnection(conn.id); setShowSchemaDialog(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition">
                                                <Search className="w-3.5 h-3.5" />
                                                Schema
                                            </button>
                                        )}

                                        <button onClick={() => setExpandedId(expanded ? null : conn.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition ml-auto">
                                            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            Details
                                        </button>
                                    </div>

                                    <AnimatePresence>
                                        {expanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                {conn.dbType === 'webhook' ? (
                                                    <WebhookDetails connId={conn.id} />
                                                ) : (
                                                    <div className="mt-3 p-3 bg-muted/50 rounded-lg text-xs space-y-1 text-muted-foreground">
                                                        <p><span className="font-medium">Schema:</span> {conn.schemaName}</p>
                                                        <p><span className="font-medium">Username:</span> {conn.username}</p>
                                                        <p><span className="font-medium">Active:</span> {conn.isActive ? 'Yes' : 'No'}</p>
                                                        <p><span className="font-medium">Last Synced:</span> {conn.lastSyncedAt ? new Date(conn.lastSyncedAt).toLocaleString() : 'Never'}</p>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}

                                        {isQueryOpen && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                <div className="mt-3 space-y-2">
                                                    <textarea
                                                        value={sqlDraft}
                                                        onChange={e => setSqlDraft(e.target.value)}
                                                        rows={4}
                                                        className="w-full p-3 rounded-lg bg-muted/50 border border-border text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                        placeholder="SELECT * FROM your_table LIMIT 10"
                                                    />
                                                    <button onClick={() => handleQuery(conn.id)}
                                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition w-full justify-center">
                                                        <Play className="w-3.5 h-3.5" /> Run Query
                                                    </button>
                                                    {queryResult && (
                                                        <div className="overflow-x-auto max-h-48 rounded-lg border border-border">
                                                            <table className="text-xs w-full">
                                                                <thead className="bg-muted sticky top-0">
                                                                    <tr>{queryResult.columns.map(c => <th key={c} className="px-2 py-1 text-left font-medium text-muted-foreground">{c}</th>)}</tr>
                                                                </thead>
                                                                <tbody>
                                                                    {queryResult.data.map((row, i) => (
                                                                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                                                                            {queryResult.columns.map(c => <td key={c} className="px-2 py-1 text-foreground">{String(row[c] ?? '')}</td>)}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Add Connection Modal */}
            <AnimatePresence>
                {showForm && (
                    <AddConnectionModal
                        onClose={() => setShowForm(false)}
                        onSave={createMut.mutate}
                        isSaving={createMut.isPending}
                    />
                )}
            </AnimatePresence>

            {/* Schema Dialog */}
            <Dialog open={showSchemaDialog} onOpenChange={setShowSchemaDialog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Schema for {conns.find(c => c.id === selectedConnection)?.name}</DialogTitle>
                        <DialogDescription>
                            Browse tables and columns for this connection.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="h-[60vh]">
                        {isLoadingSchema ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : schema && schema.length > 0 ? (
                            <ScrollArea className="h-full pr-4">
                                <div className="space-y-4">
                                    {schema.map((table) => (
                                        <div key={`${table.schemaName}.${table.tableName} `} className="border border-border rounded-lg p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-medium flex items-center gap-2">
                                                    {table.tableName}
                                                    <Badge variant="outline" className="text-xs">
                                                        {table.tableType}
                                                    </Badge>
                                                </h4>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm text-muted-foreground">
                                                        {table.rowCount.toLocaleString()} rows
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        disabled={createDatasetMut.isPending}
                                                        onClick={() => createDatasetMut.mutate({
                                                            id: selectedConnection!,
                                                            tableName: table.tableName,
                                                            schemaName: table.schemaName
                                                        })}
                                                    >
                                                        <LayoutGrid className="w-3 h-3 mr-1" />
                                                        Create Dataset
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                {table.columns.map(col => (
                                                    <p key={col.name} className="flex items-center gap-2">
                                                        <span className="font-mono text-foreground">{col.name}</span>
                                                        <span className="text-[10px] uppercase px-1 py-0.5 rounded-sm bg-muted">{col.type}</span>
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <Database className="w-10 h-10 mx-auto mb-3" />
                                <p>No schema found or connection not synced.</p>
                                <Button variant="link" onClick={() => handleSync(selectedConnection!)} className="mt-2">
                                    <RefreshCcw className="w-4 h-4 mr-2" /> Sync Schema
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Add Connection Modal ─────────────────────────────────────────────────────
function AddConnectionModal({
    onClose,
    onSave,
    isSaving,
}: {
    onClose: () => void;
    onSave: (p: ConnectionCreate) => void;
    isSaving: boolean;
}) {
    const { data: types = [] } = useDBTypes();

    const [form, setForm] = useState<ConnectionCreate>({
        name: '',
        dbType: 'postgresql',
        host: '',
        port: 5432,
        databaseName: 'postgres',
        username: 'postgres',
        password: '',
        sslMode: 'prefer',
        schemaName: 'public',
    });

    const set = (k: keyof ConnectionCreate, v: string | number) =>
        setForm(prev => ({ ...prev, [k]: v }));

    const handleTypeChange = (typeId: string) => {
        const meta = types.find(t => t.id === typeId);
        set('dbType', typeId);
        if (meta?.defaultPort) set('port', meta.defaultPort);
        // Supabase-specific defaults
        if (typeId === 'supabase') {
            set('sslMode', 'require');
            set('schemaName', 'public');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden"
            >
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Add External Connection</h2>
                            <p className="text-xs text-muted-foreground">Supports Supabase, PostgreSQL, MySQL, MSSQL, SQLite, ClickHouse</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Connection name */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Connection name</label>
                        <input className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="My Supabase Prod DB" value={form.name} onChange={e => set('name', e.target.value)} />
                    </div>

                    {/* DB Type selector */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2">Database type</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(types.length > 0 ? types : Object.keys(DB_META).map(id => ({ id, label: id, defaultPort: 5432 }))).map((t: { id: string; label: string }) => {
                                const meta = dbMeta(t.id);
                                return (
                                    <button key={t.id} type="button" onClick={() => handleTypeChange(t.id)}
                                        className={`flex items - center gap - 2 px - 3 py - 2 rounded - lg text - xs font - medium border transition - all ${form.dbType === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'} `}>
                                        <span>{meta.emoji}</span>
                                        <span className="capitalize truncate">{t.label ?? t.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {/* Supabase tip */}
                        {form.dbType === 'supabase' && (
                            <div className="mt-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-700 dark:text-green-300">
                                💡 <strong>Supabase tip:</strong> Use your project's Connection Pooler URL for best performance.
                                Set SSL mode to <code>require</code>. Host format: <code>db.&lt;ref&gt;.supabase.co</code>
                            </div>
                        )}
                    </div>

                    {/* Connection fields */}
                    {form.dbType !== 'webhook' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Host</label>
                                <input className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder={form.dbType === 'supabase' ? 'db.abc123.supabase.co' : 'localhost'}
                                    value={form.host} onChange={e => set('host', e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Port</label>
                                <input type="number" className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={form.port} onChange={e => set('port', Number(e.target.value))} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Database name</label>
                                <input className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="postgres" value={form.databaseName} onChange={e => set('databaseName', e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
                                <input className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="postgres" value={form.username} onChange={e => set('username', e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
                                <input type="password" className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={form.password} onChange={e => set('password', e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">SSL Mode</label>
                                <select className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={form.sslMode} onChange={e => set('sslMode', e.target.value)}>
                                    <option value="disable">disable</option>
                                    <option value="prefer">prefer</option>
                                    <option value="require">require</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Schema</label>
                                <input className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="public" value={form.schemaName} onChange={e => set('schemaName', e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition">Cancel</button>
                    <button
                        disabled={isSaving || !form.name || (form.dbType !== 'webhook' && !form.host)}
                        onClick={() => onSave(form)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Save Connection
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
