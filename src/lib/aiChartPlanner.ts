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
  width: 'full' | 'half' | 'third';
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
  pivot_table: 'pivot_table',
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

  const prompt = `You are a data analyst AI. Map dataset columns to report template sections.

DATASET COLUMNS:
${colDesc}

SAMPLE DATA (first 5 rows):
${sampleStr}

PAGE: "${page.title}" ${page.subtitle ? `— ${page.subtitle}` : ''}
USER FOCUS: ${userPrompt || 'general analysis'}

SECTIONS TO FILL (each needs xAxis and yAxis mapped to real dataset columns):
${sectionsDesc}

RULES:
- xAxis: must be a column name from the dataset (category, date, or text column)
- yAxis: must be a column name from the dataset (numeric column preferred)
- groupBy: optional column for grouping/stacking
- For kpi_cards (stat type): set xAxis="" yAxis="" — will show aggregated stats
- For pivot_table: set xAxis as the row column, yAxis as the value column
- For horizontal_bar: xAxis is the value (number), yAxis is the category (text/string)
- If the column doesn't clearly match, set fallbackToText=true and provide a fallbackText explanation
- Write insight in Indonesian (1-2 sentences describing what this chart shows)
- Title should be professional and specific to the data

Respond ONLY with a valid JSON array (no explanation text, no markdown):
[
  {
    "sectionId": "...",
    "chartType": "bar|line|pie|area|horizontal_bar|pivot_table|stat|text",
    "xAxis": "column_name_or_empty",
    "yAxis": "column_name_or_empty",
    "groupBy": "column_name_or_null",
    "limit": null_or_number,
    "sortOrder": "asc|desc|none",
    "title": "Specific professional chart title",
    "insight": "Narasi singkat dalam bahasa Indonesia tentang apa yang ditampilkan chart ini.",
    "fallbackToText": false,
    "fallbackText": null
  }
]`;

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

  // Merge AI plans dengan metadata section asli
  const mergedChartPlans: AIChartPlan[] = chartableSections.map((section) => {
    const aiPlan = aiPlans.find((p) => p.sectionId === section.id) || {};
    const defaultChartType = SECTION_TO_CHART_TYPE[section.type] || 'bar';

    return {
      sectionId: section.id,
      sectionType: section.type,
      sectionTitle: section.title,
      chartType: (aiPlan.chartType as WidgetType) || defaultChartType,
      xAxis: aiPlan.xAxis || '',
      yAxis: aiPlan.yAxis || '',
      groupBy: aiPlan.groupBy || section.config?.groupBy || undefined,
      limit:
        typeof aiPlan.limit === 'number'
          ? aiPlan.limit
          : section.config?.limit || undefined,
      sortOrder: aiPlan.sortOrder || section.config?.sort || 'desc',
      title: aiPlan.title || section.title,
      insight: aiPlan.insight || '',
      width: (section.width as 'full' | 'half' | 'third') || 'half',
      height: section.height,
      fallbackToText: aiPlan.fallbackToText === true,
      fallbackText: aiPlan.fallbackText || undefined,
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
