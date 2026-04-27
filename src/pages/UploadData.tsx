import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, FileJson, File as FileIcon, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useUploadDataset } from '@/hooks/useApi';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

interface UploadedFile {
  file: { name: string; size: number; contents?: Uint8Array; path?: string };
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMsg?: string;
}

export default function UploadData() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const uploadMutation = useUploadDataset();
  const { toast } = useToast();
  const navigate = useNavigate();

  const uploadToAPI = useCallback(async (fileData: UploadedFile['file']): Promise<boolean> => {
    const formData = new FormData();
    
    let fileBlob: File;
    if (fileData.contents) {
      fileBlob = new File([new Uint8Array(fileData.contents)], fileData.name);
    } else if ('size' in fileData && (fileData as any).rawFile) {
       fileBlob = (fileData as any).rawFile;
    } else {
      return false;
    }

    formData.append('file', fileBlob);
    try {
      await uploadMutation.mutateAsync(formData);
      return true;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed';
      console.error('Upload error:', msg);
      return false;
    }
  }, [uploadMutation]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({ 
      file: { name: file.name, size: file.size, rawFile: file } as any, 
      status: 'pending' 
    }));
    const startIdx = uploadedFiles.length;
    setUploadedFiles((prev) => [...prev, ...newFiles]);

    let anySuccess = false;

    for (let i = 0; i < newFiles.length; i++) {
      setUploadedFiles((prev) =>
        prev.map((f, j) => (j === startIdx + i ? { ...f, status: 'processing' } : f))
      );

      const ok = await uploadToAPI(newFiles[i].file);

      setUploadedFiles((prev) =>
        prev.map((f, j) =>
          j === startIdx + i
            ? { ...f, status: ok ? 'success' : 'error', errorMsg: ok ? undefined : 'Server error' }
            : f
        )
      );

      if (ok) {
        anySuccess = true;
        toast({
          title: 'File uploaded',
          description: `${newFiles[i].file.name} processed and saved to database.`,
        });
      } else {
        toast({
          title: 'Upload failed',
          description: `Could not process ${newFiles[i].file.name}. Check format.`,
          variant: 'destructive',
        });
      }
    }

    if (anySuccess) {
      setTimeout(() => navigate('/datasets'), 1500);
    }
  }, [uploadedFiles.length, uploadToAPI, toast, navigate]);

  const handleNativeUpload = async () => {
    if (!isTauri()) return;

    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'json'] }
        ]
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const startIdx = uploadedFiles.length;
      
      const newFiles: UploadedFile[] = await Promise.all(paths.map(async (path) => {
        const name = path.split(/[\\/]/).pop() || 'unknown';
        const contents = await readFile(path);
        return {
          file: { name, size: contents.length, contents, path },
          status: 'pending' as const
        };
      }));

      setUploadedFiles((prev) => [...prev, ...newFiles]);

      for (let i = 0; i < newFiles.length; i++) {
        setUploadedFiles((prev) =>
          prev.map((f, j) => (j === startIdx + i ? { ...f, status: 'processing' } : f))
        );

        const ok = await uploadToAPI(newFiles[i].file);

        setUploadedFiles((prev) =>
          prev.map((f, j) =>
            j === startIdx + i
              ? { ...f, status: ok ? 'success' : 'error', errorMsg: ok ? undefined : 'Server error' }
              : f
          )
        );

        if (ok) {
          toast({ title: 'File uploaded', description: `${newFiles[i].file.name} processed.` });
        }
      }
    } catch (err) {
      console.error('Native upload error:', err);
      toast({ title: 'Upload error', description: 'Failed to open native dialog', variant: 'destructive' });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: isTauri(), // Disable click for dropzone if in Tauri to use our native handler
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/json': ['.json'],
    },
  });

  const removeFile = (index: number) =>
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return FileSpreadsheet;
    if (ext === 'json') return FileJson;
    return FileIcon;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Upload className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Upload Data
              <HelpTooltip text="Drag & drop file CSV, Excel (.xlsx/.xls) ke area upload. File akan diproses backend dan tersimpan ke database." />
            </h1>
            <p className="text-muted-foreground">Import your data files for analysis</p>
          </div>
        </div>
      </motion.div>

      {/* Dropzone */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <div
          {...getRootProps()}
          onClick={isTauri() ? handleNativeUpload : (getRootProps() as any).onClick}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300',
            isDragActive
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          {!isTauri() && <input {...getInputProps()} />}
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300',
              isDragActive ? 'gradient-primary scale-110' : 'bg-muted'
            )}>
              <Upload className={cn('w-8 h-8 transition-colors', isDragActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {isDragActive ? 'Drop your files here' : isTauri() ? 'Click to open file picker' : 'Drag & drop your files'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {isTauri() ? 'Using native Windows explorer' : 'or click to browse from your computer'}
            </p>
            <div className="flex gap-2 flex-wrap justify-center">
              {['CSV', 'Excel (.xlsx)', 'XLS'].map((format) => (
                <span key={format} className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">{format}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">Files are processed and stored in PostgreSQL automatically.</p>
          </div>
        </div>
      </motion.div>

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Uploaded Files</h3>
          <div className="space-y-3">
            {uploadedFiles.map((item, index) => {
              const FileIcon = getFileIcon(item.file.name);
              return (
                <div key={index} className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{item.file.name}</p>
                    <p className="text-sm text-muted-foreground">{(item.file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'processing' && (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                    {item.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                        <span className="text-xs text-destructive">{item.errorMsg}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeFile(index)} className="h-8 w-8">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Tips */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">What happens after upload?</h3>
        <ul className="space-y-2">
          {[
            'Column types are auto-detected (number, date, string, boolean)',
            'Data is stored in a private PostgreSQL table in the backend',
            'Accessible for charts, KPIs, reports, pivot tables, and AI queries',
            'Schedule automatic refresh via Scheduled Reports',
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
