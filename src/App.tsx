import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import UploadData from "./pages/UploadData";
import Datasets from "./pages/Datasets";
import DataExplorer from "./pages/DataExplorer";
import ChartBuilder from "./pages/ChartBuilder";
import DashboardBuilder from "./pages/DashboardBuilder";
import QueryEditor from "./pages/QueryEditor";
import ETLPipeline from "./pages/ETLPipeline";
import AIReports from "./pages/AIReports";
import Reports from "./pages/Reports";
import DataPrivacy from "./pages/DataPrivacy";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadData />} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/explorer" element={<DataExplorer />} />
            <Route path="/chart-builder" element={<ChartBuilder />} />
            <Route path="/dashboard-builder" element={<DashboardBuilder />} />
            <Route path="/query" element={<QueryEditor />} />
            <Route path="/etl" element={<ETLPipeline />} />
            <Route path="/ai-reports" element={<AIReports />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/privacy" element={<DataPrivacy />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
