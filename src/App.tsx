import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";

// ─── Page Skeleton Loader ─────────────────────────────────────────────────────
function PageFallback() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="h-4 w-96 rounded-md bg-muted" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ─── Auth pages (small — eager OK) ────────────────────────────────────────────
const Login    = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));

// ─── Light pages (<15 KB each) ────────────────────────────────────────────────
const Dashboard        = lazy(() => import("./pages/Dashboard"));
const Datasets         = lazy(() => import("./pages/Datasets"));
const Alerts           = lazy(() => import("./pages/Alerts"));
const KPIScorecard     = lazy(() => import("./pages/KPIScorecard"));
const Bookmarks        = lazy(() => import("./pages/Bookmarks"));
const Settings         = lazy(() => import("./pages/Settings"));
const DataPrivacy      = lazy(() => import("./pages/DataPrivacy"));
const Annotations      = lazy(() => import("./pages/Annotations"));
const CrossFilter      = lazy(() => import("./pages/CrossFilter"));
const RowLevelSecurity = lazy(() => import("./pages/RowLevelSecurity"));
const EmbedShare       = lazy(() => import("./pages/EmbedShare"));
const ExportPDF        = lazy(() => import("./pages/ExportPDF"));
const ScheduledReports = lazy(() => import("./pages/ScheduledReports"));
const Reports          = lazy(() => import("./pages/Reports"));
const Connections      = lazy(() => import("./pages/Connections"));
const DataRefresh      = lazy(() => import("./pages/DataRefresh"));
const NotFound         = lazy(() => import("./pages/NotFound"));
const EmbedViewer      = lazy(() => import("./pages/EmbedViewer"));

// ─── Medium pages (15–25 KB) ──────────────────────────────────────────────────
const DataExplorer      = lazy(() => import("./pages/DataExplorer"));
const PivotTable        = lazy(() => import("./pages/PivotTable"));
const DataStories            = lazy(() => import("./pages/DataStories"));
const StoryPresentation      = lazy(() => import("./pages/StoryPresentation"));
const DataProfiling     = lazy(() => import("./pages/DataProfiling"));
const CalculatedFields  = lazy(() => import("./pages/CalculatedFields"));
const ReportTemplates   = lazy(() => import("./pages/ReportTemplates"));
const QueryEditor       = lazy(() => import("./pages/QueryEditor"));
const DataModeling      = lazy(() => import("./pages/DataModeling"));
const DBDiagram         = lazy(() => import("./pages/DBDiagram"));

// ─── Heavy pages (echarts / deck.gl / maplibre / xyflow — largest bundles) ───
//    Each becomes a separate async chunk on first visit
const ChartBuilder     = lazy(() => import("./pages/ChartBuilder"));
const DashboardBuilder = lazy(() => import("./pages/DashboardBuilder"));
const GeoVisualization = lazy(() => import("./pages/GeoVisualization"));
const VisualETL        = lazy(() => import("./pages/VisualETL"));
const ETLPipeline      = lazy(() => import("./pages/ETLPipeline"));
const AskData          = lazy(() => import("./pages/AskData"));
const AIReports        = lazy(() => import("./pages/AIReports"));
const UploadData       = lazy(() => import("./pages/UploadData"));

// ─── QueryClient ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min global default
      retry: 1,
    },
  },
});

// ─── Auth guard ───────────────────────────────────────────────────────────────
function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading)
    return (
      <div className="flex h-screen w-full items-center justify-center">
        Loading session...
      </div>
    );
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      {/* Each route transition shows the skeleton until the chunk loads */}
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/"                 element={<Dashboard />} />
          <Route path="/upload"           element={<UploadData />} />
          <Route path="/datasets"         element={<Datasets />} />
          <Route path="/explorer"         element={<DataExplorer />} />
          <Route path="/ask-data"         element={<AskData />} />
          <Route path="/pivot"            element={<PivotTable />} />
          <Route path="/chart-builder"    element={<ChartBuilder />} />
          <Route path="/dashboard-builder"element={<DashboardBuilder />} />
          <Route path="/kpi"              element={<KPIScorecard />} />
          <Route path="/query"            element={<QueryEditor />} />
          <Route path="/etl"              element={<ETLPipeline />} />
          <Route path="/modeling"         element={<DataModeling />} />
          <Route path="/db-diagram"       element={<DBDiagram />} />
          <Route path="/visual-etl"       element={<VisualETL />} />
          <Route path="/calculated-fields"element={<CalculatedFields />} />
          <Route path="/data-profiling"   element={<DataProfiling />} />
          <Route path="/bookmarks"        element={<Bookmarks />} />
          <Route path="/geo"              element={<GeoVisualization />} />
          <Route path="/cross-filter"     element={<CrossFilter />} />
          <Route path="/annotations"      element={<Annotations />} />
          <Route path="/scheduled-reports"element={<ScheduledReports />} />
          <Route path="/rls"              element={<RowLevelSecurity />} />
          <Route path="/embed"            element={<EmbedShare />} />
          <Route path="/embed-share"      element={<EmbedShare />} />
          <Route path="/export"           element={<ExportPDF />} />
          <Route path="/data-refresh"     element={<DataRefresh />} />
          <Route path="/report-templates" element={<ReportTemplates />} />
          <Route path="/stories"          element={<DataStories />} />
          <Route path="/ai-reports"       element={<AIReports />} />
          <Route path="/reports"          element={<Reports />} />
          <Route path="/alerts"           element={<Alerts />} />
          <Route path="/connections"      element={<Connections />} />
          <Route path="/privacy"          element={<DataPrivacy />} />
          <Route path="/settings"         element={<Settings />} />
          <Route path="*"                 element={<Navigate to="/not-found" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login"               element={<Login />} />
                <Route path="/register"            element={<Register />} />
                <Route path="/stories/view/:storyId" element={<StoryPresentation />} />
                <Route path="/embed/view/:token"   element={<EmbedViewer />} />
                {/* Standalone 404 */}
                <Route path="/not-found"           element={<NotFound />} />
                {/* Protected — nested inside auth guard */}
                <Route path="/*"                   element={<ProtectedLayout />} />
                {/* Top-level catch-all */}
                <Route path="*"                    element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
