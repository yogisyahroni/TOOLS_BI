import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, FileJson, File, X, CheckCircle, AlertCircle, Database } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useDataStore } from '@/stores/dataStore';
import type { DataSet, DataColumn } from '@/types/data';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { HelpTooltip } from '@/components/HelpTooltip';

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function detectColumnType(values: any[]): DataColumn['type'] {
  const sample = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 100);
  if (sample.every(v => typeof v === 'boolean' || v === 'true' || v === 'false')) return 'boolean';
  if (sample.every(v => !isNaN(Number(v)))) return 'number';
  if (sample.every(v => !isNaN(Date.parse(v)))) return 'date';
  return 'string';
}

const SAMPLE_DATA = [
  { name: 'Alice', age: 30, city: 'Jakarta', salary: 8500000, department: 'Engineering' },
  { name: 'Bob', age: 25, city: 'Surabaya', salary: 6200000, department: 'Marketing' },
  { name: 'Charlie', age: 35, city: 'Bandung', salary: 9800000, department: 'Engineering' },
  { name: 'Diana', age: 28, city: 'Jakarta', salary: 7100000, department: 'Design' },
  { name: 'Eve', age: 32, city: 'Yogyakarta', salary: 7500000, department: 'Marketing' },
  { name: 'Frank', age: 40, city: 'Medan', salary: 11000000, department: 'Management' },
  { name: 'Grace', age: 27, city: 'Jakarta', salary: 6800000, department: 'Engineering' },
  { name: 'Hadi', age: 33, city: 'Semarang', salary: 8200000, department: 'Design' },
  { name: 'Ika', age: 29, city: 'Bandung', salary: 7300000, department: 'Engineering' },
  { name: 'Joko', age: 45, city: 'Jakarta', salary: 13000000, department: 'Management' },
];

interface UploadedFile {
  file: File;
  status: 'pending' | 'processing' | 'success' | 'error';
}

export default function UploadData() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const { addDataSet } = useDataStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileCountRef = useRef(0);

  const processFile = useCallback(async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    try {
      let data: Record<string, any>[] = [];
      let columns: DataColumn[] = [];

      if (extension === 'csv') {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        data = result.data as Record<string, any>[];
        if (result.meta.fields) {
          columns = result.meta.fields.map(name => ({
            name,
            type: detectColumnType(data.map(row => row[name])),
            nullable: data.some(row => row[name] === null || row[name] === undefined || row[name] === ''),
          }));
        }
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet);
        if (data.length > 0) {
          columns = Object.keys(data[0]).map(name => ({
            name,
            type: detectColumnType(data.map(row => row[name])),
            nullable: data.some(row => row[name] === null || row[name] === undefined),
          }));
        }
      } else if (extension === 'json') {
        const text = await file.text();
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : [parsed];
        if (data.length > 0) {
          columns = Object.keys(data[0]).map(name => ({
            name,
            type: detectColumnType(data.map(row => row[name])),
            nullable: data.some(row => row[name] === null || row[name] === undefined),
          }));
        }
      }

      const dataSet: DataSet = {
        id: generateId(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        columns,
        data,
        uploadedAt: new Date(),
        rowCount: data.length,
        size: file.size,
      };

      addDataSet(dataSet);
      return true;
    } catch (error) {
      console.error('Error processing file:', error);
      return false;
    }
  }, [addDataSet]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const startIndex = fileCountRef.current;
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({ file, status: 'pending' }));
    fileCountRef.current += newFiles.length;
    setUploadedFiles(prev => [...prev, ...newFiles]);

    let anySuccess = false;

    for (let i = 0; i < newFiles.length; i++) {
      const idx = startIndex + i;
      setUploadedFiles(prev =>
        prev.map((f, j) => j === idx ? { ...f, status: 'processing' } : f)
      );

      const success = await processFile(newFiles[i].file);

      setUploadedFiles(prev =>
        prev.map((f, j) => j === idx ? { ...f, status: success ? 'success' : 'error' } : f)
      );

      if (success) {
        anySuccess = true;
        toast({
          title: 'File uploaded successfully',
          description: `${newFiles[i].file.name} has been processed and added to your datasets.`,
        });
      } else {
        toast({
          title: 'Error processing file',
          description: `Failed to process ${newFiles[i].file.name}. Please check the file format.`,
          variant: 'destructive',
        });
      }
    }

    if (anySuccess) {
      setTimeout(() => {
        toast({
          title: 'Ready to explore',
          description: 'Your datasets are ready. Redirecting to Datasets page...',
        });
        setTimeout(() => navigate('/datasets'), 1500);
      }, 500);
    }
  }, [processFile, toast, navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/json': ['.json'],
    },
  });

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const loadSampleData = () => {
    const columns: DataColumn[] = [
      { name: 'name', type: 'string', nullable: false },
      { name: 'age', type: 'number', nullable: false },
      { name: 'city', type: 'string', nullable: false },
      { name: 'salary', type: 'number', nullable: false },
      { name: 'department', type: 'string', nullable: false },
    ];

    const dataSet: DataSet = {
      id: generateId(),
      name: 'Sample Employee Data',
      fileName: 'sample-employees.csv',
      columns,
      data: SAMPLE_DATA,
      uploadedAt: new Date(),
      rowCount: SAMPLE_DATA.length,
      size: JSON.stringify(SAMPLE_DATA).length,
    };

    addDataSet(dataSet);
    toast({
      title: 'Sample data loaded',
      description: 'Sample Employee Data has been added to your datasets.',
    });
    setTimeout(() => navigate('/datasets'), 1000);
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return FileSpreadsheet;
    if (ext === 'json') return FileJson;
    return File;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Upload className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Upload Data <HelpTooltip text="Drag & drop file CSV, Excel (.xlsx/.xls), atau JSON ke area upload. File akan otomatis diproses dan tersedia sebagai dataset untuk analisis." /></h1>
            <p className="text-muted-foreground">Import your data files for analysis</p>
          </div>
        </div>
      </motion.div>

      {/* Dropzone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300',
            isDragActive
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300',
              isDragActive ? 'gradient-primary scale-110' : 'bg-muted'
            )}>
              <Upload className={cn(
                'w-8 h-8 transition-colors',
                isDragActive ? 'text-primary-foreground' : 'text-muted-foreground'
              )} />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {isDragActive ? 'Drop your files here' : 'Drag & drop your files'}
            </h3>
            <p className="text-muted-foreground mb-4">or click to browse from your computer</p>
            <div className="flex gap-2 flex-wrap justify-center">
              {['CSV', 'Excel', 'JSON'].map((format) => (
                <span key={format} className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
                  {format}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Load Sample Data */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">Try with Sample Data</h3>
              <p className="text-sm text-muted-foreground">Load sample employee data to explore all features</p>
            </div>
          </div>
          <Button onClick={loadSampleData} variant="outline">
            Load Sample Data
          </Button>
        </div>
      </motion.div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
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
                    {item.status === 'success' && <CheckCircle className="w-5 h-5 text-success" />}
                    {item.status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}
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

      {/* ETL Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">ETL Support</h3>
        <p className="text-muted-foreground mb-4">After uploading, you can use our ETL pipeline to:</p>
        <ul className="space-y-2">
          {[
            'Extract data from multiple sources',
            'Transform data with filters, aggregations, and joins',
            'Load processed data into reports and visualizations',
            'Schedule automated data refreshes',
          ].map((item, index) => (
            <li key={index} className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
