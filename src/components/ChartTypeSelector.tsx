import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { 
  ALL_CHART_TYPES, 
  COMPARISON_CHART_TYPES,
  TIME_SERIES_CHART_TYPES,
  COMPOSITION_CHART_TYPES,
  DISTRIBUTION_CHART_TYPES,
  CORRELATION_CHART_TYPES,
  GEOSPATIAL_CHART_TYPES,
  TEMPORAL_CHART_TYPES,
  CATEGORICAL_CHART_TYPES,
  KPI_CHART_TYPES,
  ADVANCED_CHART_TYPES,
  ChartType 
} from '@/constants/chartTypes';

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (value: ChartType) => void;
}

const CATEGORY_MAP = [
  { name: 'Comparison', items: COMPARISON_CHART_TYPES },
  { name: 'Trend & Time Series', items: TIME_SERIES_CHART_TYPES },
  { name: 'Composition', items: COMPOSITION_CHART_TYPES },
  { name: 'Distribution', items: DISTRIBUTION_CHART_TYPES },
  { name: 'Correlation', items: CORRELATION_CHART_TYPES },
  { name: 'Geospatial', items: GEOSPATIAL_CHART_TYPES },
  { name: 'Temporal', items: TEMPORAL_CHART_TYPES },
  { name: 'Categorical', items: CATEGORICAL_CHART_TYPES },
  { name: 'KPI & Single Value', items: KPI_CHART_TYPES },
  { name: 'Advanced', items: ADVANCED_CHART_TYPES },
];

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedChartInfo = ALL_CHART_TYPES.find(c => c.id === value) || ALL_CHART_TYPES[0];
  const Icon = selectedChartInfo.icon;

  const filteredCategories = CATEGORY_MAP.map(cat => ({
    ...cat,
    items: cat.items.filter(item => item.label.toLowerCase().includes(search.toLowerCase()))
  })).filter(cat => cat.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal bg-muted/50 border-border h-12 hover:bg-muted/70 transition-all">
          <Icon className="w-5 h-5 mr-3 text-primary" />
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">{selectedChartInfo.label}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{CATEGORY_MAP.find(cat => cat.items.some(i => i.id === value))?.name || 'Chart'}</span>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card/60 backdrop-blur-xl z-10 shrink-0">
          <DialogTitle className="text-2xl flex items-center gap-2 font-bold tracking-tight">
            Pilih Tipe Chart
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1.5">
            Pilih dari 80+ visualisasi yang sangat responsif untuk merepresentasikan data Anda dengan sempurna.
          </DialogDescription>
          <div className="relative mt-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cari tipe chart (misal: Bar, Scatter, Waterfall)..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 bg-muted/50 border-border focus-visible:ring-primary shadow-sm" 
            />
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-6 z-0 bg-muted/20">
          <div className="space-y-8 pb-10">
            {filteredCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
                <Search className="w-12 h-12 opacity-20" />
                <p>Tidak ada tipe chart yang cocok dengan pencarian "{search}"</p>
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.name} className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground/80 uppercase tracking-widest flex items-center gap-3">
                    {category.name} 
                    <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0 bg-primary/10 text-primary border-primary/20">{category.items.length}</Badge>
                    <div className="h-px bg-border flex-1 ml-2"></div>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {category.items.map((chartItem) => (
                      <button
                        key={chartItem.id}
                        onClick={() => {
                          onChange(chartItem.id);
                          setOpen(false);
                        }}
                        className={`group flex flex-col items-center justify-center p-4 gap-3 rounded-xl border transition-all duration-300 text-center relative overflow-hidden
                          ${value === chartItem.id 
                            ? 'bg-primary/5 border-primary ring-1 ring-primary shadow-sm' 
                            : 'bg-card border-border hover:border-primary/50 hover:bg-muted/50 hover:shadow-md hover:-translate-y-0.5'
                          }
                        `}
                      >
                        {value === chartItem.id && (
                          <div className="absolute inset-0 bg-primary/5 opacity-50"></div>
                        )}
                        <div className={`p-2.5 rounded-xl transition-all duration-300 relative z-10 ${value === chartItem.id ? 'bg-primary text-primary-foreground shadow-lg scale-110' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-110'}`}>
                          <chartItem.icon className="w-6 h-6" strokeWidth={value === chartItem.id ? 2.5 : 2} />
                        </div>
                        <span className={`text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2 px-1 relative z-10 transition-colors ${value === chartItem.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                          {chartItem.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
