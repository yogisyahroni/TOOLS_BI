import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/stores/authStore";

// Auth pages
import Login from "./pages/Login";
import Register from "./pages/Register";

// App pages
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
import AskData from "./pages/AskData";
import DataStories from "./pages/DataStories";
import KPIScorecard from "./pages/KPIScorecard";
import PivotTable from "./pages/PivotTable";
import Alerts from "./pages/Alerts";
import DataModeling from "./pages/DataModeling";
import DBDiagram from "./pages/DBDiagram";
import VisualETL from "./pages/VisualETL";
import CalculatedFields from "./pages/CalculatedFields";
import DataProfiling from "./pages/DataProfiling";
import Bookmarks from "./pages/Bookmarks";
import GeoVisualization from "./pages/GeoVisualization";
import ScheduledReports from "./pages/ScheduledReports";
import RowLevelSecurity from "./pages/RowLevelSecurity";
import CrossFilter from "./pages/CrossFilter";
import Annotations from "./pages/Annotations";
import EmbedShare from "./pages/EmbedShare";
import ExportPDF from "./pages/ExportPDF";
import DataRefresh from "./pages/DataRefresh";
import ReportTemplates from "./pages/ReportTemplates";
import Connections from "./pages/Connections";
import ImportPage from "./pages/ImportPage";
import NotFound from "./pages/NotFound";
import DataConnectors from './pages/DataConnectors';

import EmbedViewer from "./pages/EmbedViewer";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min global default
      retry: 1,
    },
  },
});

// ────────────────────────────────────────────────────────────────
// Auth guard: redirects to /login if not authenticated
// ────────────────────────────────────────────────────────────────
function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<UploadData />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/connectors" element={<DataConnectors />} />
        <Route path="/explorer" element={<DataExplorer />} />
        <Route path="/ask-data" element={<AskData />} />
        <Route path="/pivot" element={<PivotTable />} />
        <Route path="/chart-builder" element={<ChartBuilder />} />
        <Route path="/dashboard-builder" element={<DashboardBuilder />} />
        <Route path="/kpi" element={<KPIScorecard />} />
        <Route path="/query" element={<QueryEditor />} />
        <Route path="/etl" element={<ETLPipeline />} />
        <Route path="/modeling" element={<DataModeling />} />
        <Route path="/db-diagram" element={<DBDiagram />} />
        <Route path="/visual-etl" element={<VisualETL />} />
        <Route path="/calculated-fields" element={<CalculatedFields />} />
        <Route path="/data-profiling" element={<DataProfiling />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/geo" element={<GeoVisualization />} />
        <Route path="/cross-filter" element={<CrossFilter />} />
        <Route path="/annotations" element={<Annotations />} />
        <Route path="/scheduled-reports" element={<ScheduledReports />} />
        <Route path="/rls" element={<RowLevelSecurity />} />
        <Route path="/embed" element={<EmbedShare />} />
        <Route path="/export" element={<ExportPDF />} />
        <Route path="/data-refresh" element={<DataRefresh />} />
        <Route path="/report-templates" element={<ReportTemplates />} />
        <Route path="/stories" element={<DataStories />} />
        <Route path="/ai-reports" element={<AIReports />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/privacy" element={<DataPrivacy />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/embed/view/:token" element={<EmbedViewer />} />
          {/* Standalone 404 — renders WITHOUT AppLayout/sidebar */}
          <Route path="/not-found" element={<NotFound />} />
          {/* Protected routes — all nested inside auth guard */}
          <Route path="/*" element={<ProtectedLayout />} />
          {/* Top-level catch-all fallback (reaches here only if nothing matches) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
