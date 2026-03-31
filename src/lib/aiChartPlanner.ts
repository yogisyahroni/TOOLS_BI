/**
 * AI Chart Planner
 * Menganalisis dataset dan memetakan kolom ke setiap section template.
 * Menghasilkan plan yang kemudian dieksekusi untuk membuat chart nyata
 * dan menyimpannya ke Chart Builder sebelum digabung menjadi Data Story.
 */

import { callAI } from '@/lib/aiService';
import type { DataColumn, TemplatePage, TemplateSection, SlideWidget, WidgetType } from '@/types/data';

export interface AIChartPlan {
  sectionId: string;
  sectionType: TemplateSection['type'];
  sectionTitle: string;
  chartType: WidgetType;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  limit?: number;
  sortOrder?: 'asc' | 'desc' | 'none';
  title: string;
  insight: string;
  width: 'full' | 'half' | 'third' | 'quarter';
  height?: 'sm' | 'md' | 'lg';
  fallbackToText: boolean;
  fallbackText?: string;
}

export interface AIPagePlan {
  pageId: string;
  pageTitle: string;
  pageSubtitle?: string;
  sections: AIChartPlan[];
}

/** Mapping template section type → WidgetType yang paling sesuai */
const SECTION_TO_CHART_TYPE: Partial<Record<TemplateSection['type'], WidgetType>> = {
  bar_chart: 'bar',
  line_chart: 'line',
  pie_chart: 'pie',
  donut_chart: 'pie',
  stacked_bar: 'bar',
  horizontal_bar: 'horizontal_bar',
  trend_line: 'line',
  pivot_table: 'pivot_table',  // ChartRenderer now handles plain yAxis (no aggFunc: prefix needed)
  table: 'pivot_table',
  kpi_cards: 'stat',
  text: 'text',
  filter_panel: 'text',
  geo_map: 'bar', // Fallback — tidak ada geo
};

/** Section yang tidak perlu chart (static content) */
const NON_CHART_SECTIONS: TemplateSection['type'][] = ['text', 'filter_panel'];

/**
 * Memetakan kolom dataset ke section-section dalam satu page template.
 * Memanggil AI sekali per page untuk efisiensi.
 */
export async function planPageSections(
  page: TemplatePage,
  columns: DataColumn[],
  dataSample: Record<string, unknown>[],
  userPrompt: string
): Promise<AIPagePlan> {
  // Filter sections yang perlu chart (bukan teks statis)
  const chartableSections = page.sections.filter(
    (s) => !NON_CHART_SECTIONS.includes(s.type)
  );

  // Sections yang tidak perlu AI planning (text, filter)
  const staticSections: AIChartPlan[] = page.sections
    .filter((s) => NON_CHART_SECTIONS.includes(s.type))
    .map((s) => ({
      sectionId: s.id,
      sectionType: s.type,
      sectionTitle: s.title,
      chartType: 'text' as WidgetType,
      xAxis: '',
      yAxis: '',
      title: s.title,
      insight: '',
      width: (s.width as 'full' | 'half' | 'third') || 'full',
      height: s.height,
      fallbackToText: true,
      fallbackText: s.config?.content === 'ai_generated'
        ? `[AI-generated content for: ${s.title}]`
        : s.title,
    }));

  if (chartableSections.length === 0) {
    return {
      pageId: page.id,
      pageTitle: page.title,
      pageSubtitle: page.subtitle,
      sections: staticSections,
    };
  }

  // Buat deskripsi kolom untuk AI — pisah berdasarkan tipe yang sudah dinormalisasi
  const numericCols = columns.filter(c => c.type === 'number');
  const dateCols = columns.filter(c => c.type === 'date');
  const textCols = columns.filter(c => c.type === 'string');

  // Fallback: jika tidak ada numerik (tipe tidak dikenal), pakai semua kolom
  const effectiveNumericCols = numericCols.length > 0 ? numericCols : columns;

  const colDesc = [
    numericCols.length > 0 ? `NUMERIC columns (use as yAxis/value): ${numericCols.map(c => c.name).join(', ')}` : `ALL columns (use any as yAxis): ${columns.map(c => c.name).join(', ')}`,
    dateCols.length > 0 ? `DATE columns (use as xAxis for trends): ${dateCols.map(c => c.name).join(', ')}` : null,
    textCols.length > 0 ? `TEXT/CATEGORY columns (use as xAxis/groupBy): ${textCols.map(c => c.name).join(', ')}` : null,
    `\nAll columns with types:\n${columns.map(c => `  - ${c.name} (${c.type})`).join('\n')}`,
  ].filter(Boolean).join('\n');

  void effectiveNumericCols; // used for context above

  // Sample data (max 5 baris)
  const sampleStr = JSON.stringify(dataSample.slice(0, 5), null, 2);

  // Deskripsi sections yang perlu di-map
  const sectionsDesc = chartableSections
    .map((s, i) => {
      const chartType = SECTION_TO_CHART_TYPE[s.type] || 'bar';
      const configHint = JSON.stringify(s.config || {});
      return `${i + 1}. sectionId="${s.id}" title="${s.title}" type="${s.type}" suggestedChartType="${chartType}" configHint=${configHint} width="${s.width}"`;
    })
    .join('\n');

  // Chart sections that MUST have axis (never stat/text)
  const mustHaveAxisTypes: WidgetType[] = ['bar', 'line', 'pie', 'area', 'horizontal_bar', 'pivot_table', 'treemap', 'funnel'];

  const prompt = `You are a data analyst AI. Map dataset columns to data visualization sections.

DATASET COLUMNS:
${colDesc}

SAMPLE DATA (first 5 rows):
${sampleStr}

PAGE: "${page.title}" ${page.subtitle ? `— ${page.subtitle}` : ''}
USER FOCUS: ${userPrompt || 'general analysis'}

SECTIONS TO MAP:
${sectionsDesc}

STRICT RULES:
1. ALWAYS map real column names to xAxis and yAxis — never leave them empty for chart types (bar, line, pie, area, horizontal_bar, pivot_table, funnel, treemap)
2. xAxis = category/text/date column (dimension). yAxis = numeric column (metric).
3. For kpi_cards (stat type): xAxis="", yAxis="" (show aggregated metrics automatically)
4. For horizontal_bar: xAxis = numeric column (the bar length), yAxis = text/category column (the label)
5. For pie/donut: xAxis = category column (labels), yAxis = numeric column (slice values)
6. For pivot_table: xAxis = row category column (e.g. "City", "Status"), yAxis = numeric value column (PLAIN column name, e.g. "AWB" — NOT "sum:AWB"), groupBy = optional column for column breakdown
7. fallbackToText=true ONLY if no suitable columns exist at all — this must be rare (< 10% of charts)
8. When in doubt, ALWAYS assign the best-fit columns rather than using fallbackToText
9. Write insight in Indonesian — 1-2 sentences describing what this chart reveals
10. Title must be specific and professional (e.g. "Total Order per Kota" not "Bar Chart")
11. IMPORTANT: Use EXACT column names from the dataset — do not invent column names

Respond ONLY with a valid JSON array — no explanation, no markdown:
[
  {
    "sectionId": "...",
    "chartType": "bar|line|pie|area|horizontal_bar|pivot_table|stat|text",
    "width": "full|half|third|quarter",
    "xAxis": "exact_column_name",
    "yAxis": "exact_column_name",
    "groupBy": "column_name_or_null",
    "limit": 10,
    "sortOrder": "desc",
    "title": "Specific Professional Title",
    "insight": "Singkat 1-2 kalimat dalam Bahasa Indonesia.",
    "fallbackToText": false,
    "fallbackText": null
  }
]`;

  // Will be used in post-processing below
  const firstTextCol = textCols[0]?.name || columns[0]?.name || '';
  const firstNumCol = numericCols[0]?.name || columns.find(c => c.type !== 'string')?.name || columns[columns.length - 1]?.name || '';
  const firstDateCol = dateCols[0]?.name || '';
  void mustHaveAxisTypes;

  const response = await callAI([
    {
      role: 'system',
      content:
        'You are a data visualization expert. Always respond with valid JSON array only, no markdown, no explanation.',
    },
    { role: 'user', content: prompt },
  ]);

  let aiPlans: Partial<AIChartPlan>[] = [];

  if (response.error || !response.content) {
    // Fallback: semua section jadi text
    aiPlans = chartableSections.map((s) => ({
      sectionId: s.id,
      fallbackToText: true,
      fallbackText: `Tidak dapat memetakan kolom untuk: ${s.title}`,
    }));
  } else {
    try {
      // Ambil JSON dari response (bisa ada teks sebelum/sesudah)
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiPlans = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch {
      aiPlans = chartableSections.map((s) => ({
        sectionId: s.id,
        fallbackToText: true,
        fallbackText: `Gagal parse AI response untuk: ${s.title}`,
      }));
    }
  }

  // Merge AI plans dengan metadata section asli + auto-fill axis jika AI kosong
  const mergedChartPlans: AIChartPlan[] = chartableSections.map((section) => {
    const aiPlan = aiPlans.find((p) => p.sectionId === section.id) || {};
    const resolvedChartType = (aiPlan.chartType as WidgetType) || SECTION_TO_CHART_TYPE[section.type] || 'bar';
    const isStat = resolvedChartType === 'stat' || section.type === 'kpi_cards';

    // Auto-fill xAxis/yAxis if AI returned empty for non-stat chart types
    // This is the safety net: AI should ideally always fill these, but if not, use best-guess
    let resolvedX = (aiPlan.xAxis as string) || '';
    let resolvedY = (aiPlan.yAxis as string) || '';

    if (!isStat && !aiPlan.fallbackToText) {
      if (!resolvedX) {
        // For trend charts prefer date, otherwise use text column
        resolvedX = resolvedChartType === 'line' || resolvedChartType === 'area'
          ? (firstDateCol || firstTextCol)
          : firstTextCol;
      }
      if (!resolvedY) {
        resolvedY = firstNumCol;
      }
      // Only mark fallback if there's truly no columns at all
    }

    const isActuallyFallback = aiPlan.fallbackToText === true &&
      !(resolvedX && resolvedY && !isStat);

    return {
      sectionId: section.id,
      sectionType: section.type,
      sectionTitle: section.title,
      chartType: resolvedChartType,
      xAxis: isStat ? '' : resolvedX,
      yAxis: isStat ? '' : resolvedY,
      groupBy: (aiPlan.groupBy as string) || section.config?.groupBy || undefined,
      limit:
        typeof aiPlan.limit === 'number'
          ? aiPlan.limit
          : section.config?.limit || undefined,
      sortOrder: (aiPlan.sortOrder as 'asc' | 'desc' | 'none') || section.config?.sort || 'desc',
      title: (aiPlan.title as string) || section.title,
      insight: (aiPlan.insight as string) || '',
      width: (section.width as 'full' | 'half' | 'third' | 'quarter') || 'half',
      height: section.height,
      fallbackToText: isActuallyFallback,
      fallbackText: (aiPlan.fallbackText as string) || undefined,
    };
  });

  return {
    pageId: page.id,
    pageTitle: page.title,
    pageSubtitle: page.subtitle,
    sections: [...mergedChartPlans, ...staticSections],
  };
}

/**
 * Convert AIChartPlan menjadi SlideWidget (setelah chart disimpan ke Chart Builder).
 * chartId diisi setelah chartApi.create() berhasil.
 */
export function planToSlideWidget(
  plan: AIChartPlan,
  chartId?: string
): SlideWidget {
  return {
    id: plan.sectionId,
    type: plan.chartType,
    title: plan.title,
    chartId: chartId || undefined,
    datasetId: undefined, // diisi dari luar
    xAxis: plan.xAxis || undefined,
    yAxis: plan.yAxis || undefined,
    groupBy: plan.groupBy || undefined,
    limit: plan.limit || undefined,
    sortOrder: plan.sortOrder || undefined,
    insight: plan.insight || undefined,
    width: plan.width,
    height: plan.height,
    htmlContent: plan.fallbackToText ? (plan.fallbackText || plan.sectionTitle) : undefined,
    fallbackText: plan.fallbackText || undefined,
  };
}
