import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

export interface NL2SQLResult {
    sql: string;
    confidence: number;
    explanation: string;
    executionPlan: string;
    requiresApproval: boolean;
    alternatives: string[];
    latencyMs: number;
    provider: string;
}

export interface NL2SQLStreamState {
    streamingSQL: string;
    confidence: number;
    explanation: string;
    isStreaming: boolean;
    streamStage: 'idle' | 'thinking' | 'writing' | 'running' | 'done' | 'error';
    error?: string;
    progress: number;
}

export function useNL2SQL() {
    const [state, setState] = useState<NL2SQLStreamState>({
        streamingSQL: '',
        confidence: 0,
        explanation: '',
        isStreaming: false,
        streamStage: 'idle',
        progress: 0,
    });

    const eventSourceRef = useRef<EventSource | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
            abortControllerRef.current?.abort();
        };
    }, []);

    const generateSQL = useCallback(async (
        question: string,
        datasetId: string,
        options?: {
            onConfidenceChange?: (confidence: number) => void;
            onComplete?: (result: NL2SQLResult) => void;
            onError?: (error: string) => void;
        }
    ): Promise<void> => {
        // Reset state
        setState({
            streamingSQL: '',
            confidence: 0,
            explanation: '',
            isStreaming: true,
            streamStage: 'thinking',
            progress: 0,
        });

        // Close existing connection
        eventSourceRef.current?.close();

        const url = `${API_BASE}/nl2sql/stream?question=${encodeURIComponent(question)}&datasetId=${datasetId}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        let result: Partial<NL2SQLResult> = {};
        let startTime = performance.now();

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                switch (data.type) {
                    case 'thinking':
                        setState(prev => ({
                            ...prev,
                            streamStage: 'thinking',
                            explanation: data.content || 'Analyzing schema...',
                            progress: 10,
                        }));
                        break;

                    case 'token':
                        setState(prev => ({
                            ...prev,
                            streamingSQL: prev.streamingSQL + data.content,
                            streamStage: 'writing',
                            progress: Math.min(50, prev.progress + 5),
                        }));
                        break;

                    case 'confidence':
                        const confidence = parseFloat(data.score);
                        setState(prev => ({ ...prev, confidence }));
                        options?.onConfidenceChange?.(confidence);
                        break;

                    case 'explanation':
                        setState(prev => ({ ...prev, explanation: data.content }));
                        break;

                    case 'execution_plan':
                        setState(prev => ({ ...prev, executionPlan: data.content }));
                        break;

                    case 'requires_approval':
                        setState(prev => ({
                            ...prev,
                            requiresApproval: data.value,
                            progress: 80,
                        }));
                        break;

                    case 'alternatives':
                        result.alternatives = data.items;
                        break;

                    case 'provider':
                        result.provider = data.name;
                        break;

                    case 'running':
                        setState(prev => ({
                            ...prev,
                            streamStage: 'running',
                            progress: 90,
                        }));
                        break;

                    case 'complete':
                        const latencyMs = performance.now() - startTime;
                        const finalResult: NL2SQLResult = {
                            sql: data.sql || state.streamingSQL,
                            confidence: data.confidence || state.confidence,
                            explanation: data.explanation || state.explanation,
                            executionPlan: data.executionPlan || '',
                            requiresApproval: data.requiresApproval || false,
                            alternatives: data.alternatives || [],
                            latencyMs,
                            provider: data.provider || 'unknown',
                        };

                        setState(prev => ({
                            ...prev,
                            isStreaming: false,
                            streamStage: 'done',
                            progress: 100,
                        }));

                        options?.onComplete?.(finalResult);
                        eventSource.close();
                        break;

                    case 'error':
                        setState(prev => ({
                            ...prev,
                            isStreaming: false,
                            streamStage: 'error',
                            error: data.message,
                            progress: 0,
                        }));
                        options?.onError?.(data.message);
                        eventSource.close();
                        break;
                }
            } catch (e) {
                console.error('Failed to parse SSE message:', e);
            }
        };

        eventSource.onerror = (error) => {
            setState(prev => ({
                ...prev,
                isStreaming: false,
                streamStage: 'error',
                error: 'Connection error',
                progress: 0,
            }));
            options?.onError?.('Connection error');
            eventSource.close();
        };
    }, []);

    const cancelGeneration = useCallback(() => {
        eventSourceRef.current?.close();
        abortControllerRef.current?.abort();
        setState(prev => ({
            ...prev,
            isStreaming: false,
            streamStage: 'idle',
        }));
    }, []);

    const reset = useCallback(() => {
        setState({
            streamingSQL: '',
            confidence: 0,
            explanation: '',
            isStreaming: false,
            streamStage: 'idle',
            progress: 0,
        });
    }, []);

    return {
        ...state,
        generateSQL,
        cancelGeneration,
        reset,
    };
}

// Hook untuk destructive query detection
export function useDestructiveQueryCheck() {
    const checkDestructive = useCallback((sql: string): {
        isDestructive: boolean;
        severity: 'low' | 'medium' | 'high';
        warnings: string[];
    } => {
        const upperSQL = sql.toUpperCase();
        const warnings: string[] = [];
        let severity: 'low' | 'medium' | 'high' = 'low';

        // Check for DELETE without WHERE
        if (upperSQL.includes('DELETE') && !upperSQL.includes('WHERE')) {
            warnings.push('DELETE statement without WHERE clause');
            severity = 'high';
        }

        // Check for DROP
        if (upperSQL.includes('DROP')) {
            warnings.push('DROP statement detected');
            severity = 'high';
        }

        // Check for TRUNCATE
        if (upperSQL.includes('TRUNCATE')) {
            warnings.push('TRUNCATE statement detected');
            severity = 'high';
        }

        // Check for UPDATE without WHERE
        if (upperSQL.includes('UPDATE') && !upperSQL.includes('WHERE')) {
            warnings.push('UPDATE statement without WHERE clause');
            severity = 'high';
        }

        // Check for ALTER
        if (upperSQL.includes('ALTER')) {
            warnings.push('ALTER statement detected');
            severity = 'medium';
        }

        // Check for large result sets
        if (!upperSQL.includes('LIMIT') && upperSQL.includes('SELECT')) {
            warnings.push('Query without LIMIT clause - may return large result set');
            severity = severity === 'low' ? 'medium' : severity;
        }

        return {
            isDestructive: warnings.length > 0,
            severity,
            warnings,
        };
    }, []);

    return { checkDestructive };
}