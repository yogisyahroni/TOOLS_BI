import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, ArrowRight, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWSEvent } from '@/lib/websocket';

export function DriftSentinelBanner() {
    const [drift, setDrift] = useState<{ datasetId: string; report: string } | null>(null);

    // Phase 4: Listen for critical schema drift discoveries
    useWSEvent('schema_drift_detected', (payload: any) => {
        setDrift(payload);
    });

    if (!drift) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-destructive/10 border-b border-destructive/20"
            >
                <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex-1 flex items-center">
                            <span className="flex p-2 rounded-lg bg-destructive/20">
                                <ShieldAlert className="h-6 w-6 text-destructive" />
                            </span>
                            <div className="ml-3 font-medium text-destructive">
                                <span className="hidden md:inline">
                                    Critical: Schema drift detected in dataset! Definitions are out of sync with physical tables.
                                </span>
                                <span className="md:hidden">
                                    Schema drift detected!
                                </span>
                            </div>
                        </div>
                        <div className="order-3 mt-2 flex-shrink-0 w-full sm:order-2 sm:mt-0 sm:w-auto flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="destructive"
                                className="w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-white"
                                onClick={() => window.location.href = `/datasets`}
                            >
                                Fix Schema
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => setDrift(null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
