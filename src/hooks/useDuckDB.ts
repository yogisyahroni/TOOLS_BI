import { useState, useEffect, useRef, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

interface DuckDBState {
    isLoading: boolean;
    isReady: boolean;
    error?: string;
    db: duckdb.AsyncDuckDB | null;
}

export function useDuckDB() {
    const [state, setState] = useState<DuckDBState>({
        isLoading: false,
        isReady: false,
        db: null,
    });

    const dbRef = useRef<duckdb.AsyncDuckDB | null>(null);

    useEffect(() => {
        let isMounted = true;

        const initDuckDB = async () => {
            setState(prev => ({ ...prev, isLoading: true }));

            try {
                // Select bundle based on browser support
                const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
                const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

                // Create worker
                const worker_url = URL.createObjectURL(
                    new Blob([`importScripts("${bundle.mainWorker}");`], {
                        type: 'text/javascript',
                    })
                );

                const worker = new Worker(worker_url);
                const logger = new duckdb.ConsoleLogger();
                const db = new duckdb.AsyncDuckDB(logger, worker);

                await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

                if (isMounted) {
                    dbRef.current = db;
                    setState({
                        isLoading: false,
                        isReady: true,
                        db,
                    });
                }
            } catch (error) {
                if (isMounted) {
                    setState({
                        isLoading: false,
                        isReady: false,
                        error: error instanceof Error ? error.message : 'Failed to initialize DuckDB',
                        db: null,
                    });
                }
            }
        };

        initDuckDB();

        return () => {
            isMounted = false;
            dbRef.current?.terminate();
            dbRef.current = null;
        };
    }, []);

    const query = useCallback(async <T = any>(
        sql: string,
        options?: {
            params?: any[];
            timeout?: number;
        }
    ): Promise<T[]> => {
        if (!dbRef.current) {
            throw new Error('DuckDB not initialized');
        }

        const conn = await dbRef.current.connect();
        try {
            const result = await conn.query(sql);
            return result.toArray() as T[];
        } finally {
            await conn.close();
        }
    }, []);

    const registerFile = useCallback(async (
        name: string,
        buffer: Uint8Array
    ): Promise<void> => {
        if (!dbRef.current) {
            throw new Error('DuckDB not initialized');
        }
        await dbRef.current.registerFileBuffer(name, buffer);
    }, []);

    const createTableFromCSV = useCallback(async (
        tableName: string,
        csvContent: string
    ): Promise<void> => {
        if (!dbRef.current) {
            throw new Error('DuckDB not initialized');
        }

        const conn = await dbRef.current.connect();
        try {
            // Create table from CSV
            await conn.query(`
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_csv_auto('${tableName}.csv')
      `);
        } finally {
            await conn.close();
        }
    }, []);

    return {
        ...state,
        query,
        registerFile,
        createTableFromCSV,
    };
}

// Hook untuk hybrid query (DuckDB untuk small data, API untuk large)
export function useHybridQuery() {
    const duckdb = useDuckDB();
    const [useClientSide, setUseClientSide] = useState(false);

    const executeQuery = useCallback(async <T = any>(
        sql: string,
        data: { size: number; buffer?: Uint8Array },
        options?: { forceClientSide?: boolean }
    ): Promise<T[]> => {
        // Use client-side if data < 100MB or forced
        const shouldUseClientSide = options?.forceClientSide || data.size < 100 * 1024 * 1024;

        if (shouldUseClientSide && duckdb.isReady && data.buffer) {
            setUseClientSide(true);
            await duckdb.registerFile('data.parquet', data.buffer);
            return duckdb.query<T>(sql);
        }

        // Fallback to server
        setUseClientSide(false);
        const response = await fetch('/api/query', {
            method: 'POST',
            body: JSON.stringify({ sql }),
        });
        return response.json();
    }, [duckdb]);

    return {
        executeQuery,
        useClientSide,
        isDuckDBReady: duckdb.isReady,
    };
}