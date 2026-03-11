import { useEffect, useRef } from 'react';
import type { WorkerMessageType } from '../workers/dataWorker';

export function useDataWorker() {
  const workerRef = useRef<Worker | null>(null);
  const resolvers = useRef<Record<string, { resolve: (val: any) => void; reject: (err: any) => void }>>({});

  useEffect(() => {
    const worker = new Worker(new URL('../workers/dataWorker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { id, success, data, error } = e.data;
      if (resolvers.current[id]) {
        if (success) {
          resolvers.current[id].resolve(data);
        } else {
          resolvers.current[id].reject(new Error(error));
        }
        delete resolvers.current[id];
      }
    };
    
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  const runWorker = <T=any>(type: WorkerMessageType, payload: any): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker is not initialized"));
        return;
      }
      
      const id = Math.random().toString(36).substring(2, 11);
      resolvers.current[id] = { resolve, reject };
      
      workerRef.current.postMessage({
        id,
        type,
        payload
      });
    });
  };

  return { runWorker };
}
