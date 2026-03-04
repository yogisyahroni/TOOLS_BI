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
import AskData from "./pages/AskData";
import DataStories from "./pages/DataStories";
import KPIScorecard from "./pages/KPIScorecard";
import PivotTable from "./pages/PivotTable";
import Alerts from "./pages/Alerts";
import DataModeling from "./pages/DataModeling";
import DBDiagram from "./pages/DBDiagram";
import VisualETL from "./pages/VisualETL";
import CalculatedFields from "./pages/CalculatedFields";
import Bookmarks from "./pages/Bookmarks";
import ConditionalFormatting from "./pages/ConditionalFormatting";
import DrillDown from "./pages/DrillDown";
import GeoVisualization from "./pages/GeoVisualization";
import ScheduledReports from "./pages/ScheduledReports";
import RowLevelSecurity from "./pages/RowLevelSecurity";
import Parameters from "./pages/Parameters";
import CrossFilter from "./pages/CrossFilter";
import Annotations from "./pages/Annotations";
import EmbedShare from "./pages/EmbedShare";
import ExportPDF from "./pages/ExportPDF";
import DataRefresh from "./pages/DataRefresh";
import ReportTemplates from "./pages/ReportTemplates";
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
            <Route path="/drill-down" element={<DrillDown />} />
            <Route path="/formatting" element={<ConditionalFormatting />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/geo" element={<GeoVisualization />} />
            <Route path="/cross-filter" element={<CrossFilter />} />
            <Route path="/annotations" element={<Annotations />} />
            <Route path="/parameters" element={<Parameters />} />
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
