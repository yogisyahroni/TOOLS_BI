import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertCircle, ChevronRight, Activity, Clock, Share2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWSEvent } from '@/lib/websocket';
import { formatDistanceToNow } from 'date-fns';
import { haptics, nativeShare } from '@/lib/mobile';
import { ImpactStyle } from '@capacitor/haptics';
import { setTrayStatus, isDesktop } from '@/lib/desktop';

interface Investigation {
    datasetId: string;
    datasetName: string;
    anomalyDescription: string;
    analysisResult: string;
    timestamp: string | Date;
}

export function AnomalyForensicsWidget() {
    const [investigations, setInvestigations] = useState<Investigation[]>([]);

    // Phase 4: Real-time listener for AI investigation completion
    useWSEvent('investigation_completed', (payload: any) => {
        const newInvestigation = payload as Investigation;
        setInvestigations(prev => {
            const updated = [newInvestigation, ...prev].slice(0, 10);
            if (isDesktop() && updated.length > 0) {
                setTrayStatus('Warning');
            }
            return updated;
        });
    });

    useEffect(() => {
        if (isDesktop() && investigations.length === 0) {
            setTrayStatus('Optimal');
        }
    }, [investigations.length]);

    const handleShare = async (item: Investigation) => {
        await haptics.impact(ImpactStyle.Light);
        await nativeShare(
            `Anomaly Detected: ${item.datasetName}`,
            `AI Forensic Insight: ${item.anomalyDescription}`,
            window.location.origin
        );
    };

    return (
        <Card className="h-full bg-card border-border shadow-card overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">AI Forensic Insights</CardTitle>
                            <CardDescription className="text-xs">Live anomaly investigations</CardDescription>
                        </div>
                    </div>
                    <Badge variant="outline" className="animate-pulse bg-primary/5 text-primary border-primary/20">
                        Live
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px] pr-4">
                    <AnimatePresence initial={false}>
                        {investigations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[280px] text-center space-y-3 opacity-50">
                                <Activity className="w-10 h-10 text-muted-foreground" />
                                <p className="text-sm">No recent anomalies detected.<br/>System operating at Grade S++ efficiency.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {investigations.map((item, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3 }}
                                        className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors group cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-destructive" />
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    {item.datasetName}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">
                                            {item.anomalyDescription}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <Button variant="ghost" size="sm" className="h-8 text-xs text-primary hover:text-primary hover:bg-primary/10 p-0">
                                                View Forensic Discovery
                                                <ChevronRight className="w-3 h-3 ml-1" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleShare(item);
                                                }}
                                            >
                                                <Share2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
