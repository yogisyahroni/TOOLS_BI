import {
  BarChart3, LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon,
  Radar, TrendingUp, Grid3X3, Box, LayoutGrid, Gauge, Network, Combine, Columns, 
  AlignVerticalSpaceAround, Equal, GitCommit, GitPullRequest, ArrowLeftRight, 
  GitCompare, Activity, Tally3, TrendingDown, Spline, ArrowUpRight, Signal, 
  CandlestickChart, Barcode, ListTree, GitBranch as SankeyIcon,
  // Composition Chart Icons
  Aperture, Sun, GalleryHorizontal, Layers, Triangle, Filter, ArrowDownToDot, 
  Orbit, Flower, UserSquare, Circle, Hexagon, Map as MapIcon, MapPin, Route, 
  CalendarDays, AlignLeft, Type, Hash, Target, CircleDashed, Code, Waves, Flame, Thermometer
} from 'lucide-react';

export const COMPARISON_CHART_TYPES = [
  { id: 'bar', label: 'Bar', icon: BarChart3 },
  { id: 'horizontal_bar', label: 'H-Bar', icon: BarChart3 },
  { id: 'clustered_bar', label: 'Clustered', icon: Columns },
  { id: 'stacked_bar', label: 'Stacked', icon: AlignVerticalSpaceAround },
  { id: '100_stacked_bar', label: '100% Stacked', icon: Equal },
  { id: 'lollipop', label: 'Lollipop', icon: GitCommit },
  { id: 'cleveland_dot', label: 'Cleveland', icon: GitPullRequest },
  { id: 'diverging_bar', label: 'Diverging', icon: ArrowLeftRight },
  { id: 'butterfly', label: 'Butterfly', icon: GitCompare },
  { id: 'slope', label: 'Slope', icon: Activity },
  { id: 'bump', label: 'Bump', icon: TrendingUp },
  { id: 'marimekko', label: 'Marimekko', icon: Grid3X3 },
  { id: 'range_bar', label: 'Range Bar', icon: Tally3 },
  { id: 'parallel', label: 'Parallel', icon: Columns },
  { id: 'bullet', label: 'Bullet', icon: BarChart3 },
  { id: 'pareto', label: 'Pareto', icon: Combine },
  { id: 'waterfall', label: 'Waterfall', icon: BarChart3 },
];

export const TIME_SERIES_CHART_TYPES = [
  { id: 'line', label: 'Line', icon: LineChart },
  { id: 'multi_line', label: 'Multi-Line', icon: LineChart },
  { id: 'smooth_step_line', label: 'Smooth/Step Line', icon: Spline },
  { id: 'area', label: 'Area', icon: AreaChart },
  { id: 'stacked_area', label: 'Stacked Area', icon: AreaChart },
  { id: 'stream_graph', label: 'Stream Graph', icon: Signal },
  { id: 'horizon', label: 'Horizon', icon: AlignVerticalSpaceAround },
  { id: 'sparkline', label: 'Sparkline', icon: Activity },
  { id: 'cycle_plot', label: 'Cycle Plot', icon: ArrowLeftRight },
  { id: 'cumulative_flow', label: 'Cumulative Flow', icon: AreaChart },
  { id: 'burn_down', label: 'Burn-down', icon: TrendingDown },
  { id: 'burn_up', label: 'Burn-up', icon: ArrowUpRight },
  { id: 'combo_dual', label: 'Combo (Dual Axis)', icon: Combine },
  { id: 'candlestick', label: 'Candlestick', icon: CandlestickChart },
  { id: 'kagi', label: 'Kagi', icon: SankeyIcon },
  { id: 'renko', label: 'Renko', icon: Barcode },
  { id: 'point_figure', label: 'Point & Figure', icon: ListTree },
];

export const COMPOSITION_CHART_TYPES = [
  { id: 'pie', label: 'Pie Chart', icon: PieChart },
  { id: 'donut', label: 'Donut Chart', icon: Aperture },
  { id: 'treemap', label: 'Treemap', icon: LayoutGrid },
  { id: 'sunburst', label: 'Sunburst Chart', icon: Sun },
  { id: 'icicle', label: 'Icicle Chart', icon: GalleryHorizontal },
  { id: 'dendrogram', label: 'Dendrogram', icon: Network },
  { id: 'waffle', label: 'Waffle Chart', icon: Grid3X3 },
  { id: 'stacked_area_100', label: 'Stacked Area (100%)', icon: Layers },
  { id: 'pyramid', label: 'Pyramid Chart', icon: Triangle },
  { id: 'funnel', label: 'Funnel Chart', icon: Filter },
  { id: 'funnel_dropoff', label: 'Funnel w/ Drop-off', icon: ArrowDownToDot },
  { id: 'sankey', label: 'Sankey Diagram', icon: SankeyIcon },
  { id: 'chord', label: 'Chord Diagram', icon: Orbit },
  { id: 'nightingale', label: 'Nightingale Rose', icon: Flower },
  { id: 'isotype', label: 'Isotype / Pictogram', icon: UserSquare }
];

export const DISTRIBUTION_CHART_TYPES = [
  { id: 'histogram', label: 'Histogram', icon: BarChart3 },
  { id: 'density_plot', label: 'Density / KDE Plot', icon: Waves },
  { id: 'box_plot', label: 'Box Plot (Whisker)', icon: Box },
  { id: 'violin_plot', label: 'Violin Plot', icon: Spline },
  { id: 'scatter_matrix', label: 'Scatter Matrix', icon: Grid3X3 },
  { id: 'bee_swarm', label: 'Bee Swarm Plot', icon: AlignVerticalSpaceAround },
  { id: 'joyplot', label: 'Ridgejoy / Joyplot', icon: Layers },
  { id: 'dot_plot', label: 'Dot Plot', icon: ArrowDownToDot },
  { id: 'qq_plot', label: 'Q-Q Plot', icon: TrendingUp },
  { id: 'ecdf', label: 'Empirical CDF', icon: TrendingUp },
];

export const CORRELATION_CHART_TYPES = [
  { id: 'scatter', label: 'Scatter Plot', icon: ScatterIcon },
  { id: 'scatter_regression', label: 'Scatter w/ Regression', icon: TrendingUp },
  { id: 'bubble', label: 'Bubble Chart', icon: Circle },
  { id: 'heatmap', label: 'Heatmap/Correlation', icon: Flame },
  { id: 'radviz', label: 'Radviz', icon: Orbit },
  { id: 'network', label: 'Network Graph', icon: Network },
  { id: 'arc', label: 'Arc Diagram', icon: Spline },
  { id: 'hexbin', label: 'Hexbin Plot', icon: Hexagon },
  { id: 'contour', label: 'Contour Plot', icon: Waves },
];

export const GEOSPATIAL_CHART_TYPES = [
  { id: 'choropleth_map', label: 'Choropleth Map', icon: MapIcon },
  { id: 'bubble_map', label: 'Bubble Map', icon: MapPin },
  { id: 'connection_map', label: 'Connection Map', icon: Route },
  { id: 'cartogram', label: 'Cartogram', icon: MapIcon },
  { id: 'hexbin_map', label: 'Hexbin Map', icon: Hexagon },
  { id: 'geo_heatmap', label: 'Density Map', icon: Flame },
];

export const TEMPORAL_CHART_TYPES = [
  { id: 'calendar_heatmap', label: 'Calendar Heatmap', icon: CalendarDays },
  { id: 'gantt_chart', label: 'Gantt Chart', icon: AlignLeft },
  { id: 'timeline_chart', label: 'Timeline Chart', icon: GitCommit },
  { id: 'cyclic_timeline', label: 'Cyclic Timeline', icon: Orbit },
  { id: 'seasonal_plot', label: 'Seasonal Plot', icon: Layers },
];

export const CATEGORICAL_CHART_TYPES = [
  { id: 'wordcloud', label: 'Word Cloud / Tag Cloud', icon: Type },
  { id: 'wordtree', label: 'Word Tree', icon: ListTree },
  { id: 'likert', label: 'Likert Scale Chart', icon: AlignVerticalSpaceAround },
  { id: 'mekko', label: 'Mekko Chart', icon: Grid3X3 },
  { id: 'parallel_sets', label: 'Parallel Sets', icon: GitCommit },
  { id: 'upset_plot', label: 'UpSet Plot', icon: AlignVerticalSpaceAround },
  { id: 'lollipop', label: 'Lollipop Chart', icon: ListTree },
];

export const KPI_CHART_TYPES = [
  { id: 'kpi_card', label: 'KPI Card', icon: Hash },
  { id: 'gauge', label: 'Gauge / Speedometer', icon: Gauge },
  { id: 'thermometer', label: 'Thermometer Chart', icon: Thermometer },
  { id: 'big_number', label: 'Number Tile / Big Number', icon: Hash },
  { id: 'progress_bar', label: 'Progress Bar', icon: CircleDashed },
  { id: 'stoplight', label: 'Stoplight Indicator', icon: Circle },
];

export const ADVANCED_CHART_TYPES = [
  { id: '3d_scatter', label: '3D Scatter Plot', icon: Box },
  { id: '3d_surface', label: '3D Surface Plot', icon: Waves },
  { id: 'custom_echarts', label: 'Custom Option', icon: Code },
];

export const ALL_CHART_TYPES = [
  ...COMPARISON_CHART_TYPES,
  ...TIME_SERIES_CHART_TYPES,
  ...COMPOSITION_CHART_TYPES,
  ...DISTRIBUTION_CHART_TYPES,
  ...CORRELATION_CHART_TYPES,
  ...GEOSPATIAL_CHART_TYPES,
  ...TEMPORAL_CHART_TYPES,
  ...CATEGORICAL_CHART_TYPES,
  ...KPI_CHART_TYPES,
  ...ADVANCED_CHART_TYPES,
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'stat', label: 'Stat', icon: LayoutGrid },
  { id: 'gauge', label: 'Gauge', icon: Gauge },
  { id: 'combo', label: 'Combo', icon: Combine },
] as const;

export type ChartType = typeof ALL_CHART_TYPES[number]['id'];
