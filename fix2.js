import fs from 'fs';

const files = [
    'src/pages/ChartBuilder.tsx',
    'src/pages/DashboardBuilder.tsx',
    'src/pages/AIReports.tsx',
    'src/pages/ExportPDF.tsx',
    'src/pages/EmbedShare.tsx',
    'src/pages/DataPrivacy.tsx',
    'src/pages/DataModeling.tsx'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    // Change useDataStore().dataSets to useDatasets()
    if (content.match(/const\s*\{\s*dataSets\s*,([^}]+)\}\s*=\s*useDataStore\(\);/)) {
        content = content.replace(/const\s*\{\s*dataSets\s*,([^}]+)\}\s*=\s*useDataStore\(\);/, 'const { $1 } = useDataStore();\n  const { data: dataSets = [] } = useDatasets();');
    }
    if (content.match(/const\s*\{\s*([^{]+),\s*dataSets\s*([^}]+)*\}\s*=\s*useDataStore\(\);/)) {
        content = content.replace(/const\s*\{\s*([^{]+),\s*dataSets\s*([^}]+)*\}\s*=\s*useDataStore\(\);/, 'const { $1 } = useDataStore();\n  const { data: dataSets = [] } = useDatasets();');
        // wait this is fragile. Let's just do a generic replace:
    }

    // A safer regex for destructured objects containing `dataSets` (e.g. `const { dataSets, savedCharts } = useDataStore()`)
    content = content.replace(/const\s*\{\s*([^}]+)\s*\}\s*=\s*useDataStore\(\);/g, (match, vars) => {
        if (vars.includes('dataSets')) {
            const remainingVars = vars.split(',').map(v => v.trim()).filter(v => v !== 'dataSets').join(', ');
            if (remainingVars.length > 0) {
                return `const { ${remainingVars} } = useDataStore();\n  const { data: dataSets = [] } = useDatasets();`;
            } else {
                return `const { data: dataSets = [] } = useDatasets();`;
            }
        }
        return match;
    });

    // Ensure useDatasets and useDatasetData are imported
    let importsAdded = false;
    content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@\/hooks\/useApi['"];/, (match, imports) => {
        importsAdded = true;
        let newImports = imports.trim();
        if (!newImports.includes('useDatasets')) newImports += ', useDatasets';
        if (!newImports.includes('useDatasetData')) newImports += ', useDatasetData';
        return `import { ${newImports} } from '@/hooks/useApi';`;
    });

    if (!importsAdded) {
        if (content.includes('@/hooks/useApi')) {
            // it has something on multiple lines? just prepend
            content = `import { useDatasets, useDatasetData } from '@/hooks/useApi';\n` + content;
        } else {
            content = `import { useDatasets, useDatasetData } from '@/hooks/useApi';\n` + content;
        }
    }

    // Find dataset usage
    // e.g. const dataset = dataSets.find(ds => ds.id === selectedDataSet);
    // Also handle DashboardBuilder:
    // const dataset = dataSets.find(d => d.id === widget.datasetId);
    const findRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*dataSets\.find\(\s*\(*([a-zA-Z0-9_]+)\)*\s*=>\s*\2\.id\s*===\s*([a-zA-Z0-9_.]+)\s*\);/g;

    content = content.replace(findRegex, (match, datasetVarName, loopVar, stateVar) => {
        return `const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(${stateVar} || '', { limit: 10000 });
  const ${datasetVarName} = React.useMemo(() => {
    const meta = dataSets.find(${loopVar} => ${loopVar}.id === ${stateVar});
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, ${stateVar}, __datasetDataRes]);`;
    });

    if (content.includes('React.useMemo') && !content.includes('import React')) {
        content = "import React from 'react';\n" + content;
    }

    // Additional fixes for AIReports.tsx
    // AI Reports loop: const dataset = dataSets.find(d => d.id === report.datasetId);
    // It happens inside useMemo or map?
    // I'll check if there are compilation errors after this.

    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
});
