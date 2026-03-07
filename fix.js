import fs from 'fs';

const files = [
    'src/pages/VisualETL.tsx',
    'src/pages/RowLevelSecurity.tsx',
    'src/pages/QueryEditor.tsx',
    'src/pages/PivotTable.tsx',
    'src/pages/Parameters.tsx',
    'src/pages/GeoVisualization.tsx',
    'src/pages/DrillDown.tsx',
    'src/pages/DBDiagram.tsx',
    'src/pages/DataProfiling.tsx',
    'src/pages/DataExplorer.tsx',
    'src/pages/CrossFilter.tsx',
    'src/pages/ConditionalFormatting.tsx',
    'src/pages/CalculatedFields.tsx',
    'src/pages/Bookmarks.tsx',
    'src/pages/Annotations.tsx'
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    // ensure useDatasetData is imported
    if (!content.includes('useDatasetData')) {
        content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@\/hooks\/useApi['"];/, (match, imports) => {
            if (!imports.includes('useDatasetData')) {
                return `import { ${imports.trim()}, useDatasetData } from '@/hooks/useApi';`;
            }
            return match;
        });
    }

    // Regex to find "const dataset = dataSets.find(ds => ds.id === selectedDataSet);"
    const findRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*dataSets\.find\(\s*\(*([a-zA-Z0-9_]+)\)*\s*=>\s*\2\.id\s*===\s*([a-zA-Z0-9_]+)\s*\);/g;

    content = content.replace(findRegex, (match, datasetVarName, loopVar, stateVar) => {
        return `const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(${stateVar} || '', { limit: 10000 });
  const ${datasetVarName} = React.useMemo(() => {
    const meta = dataSets.find(${loopVar} => ${loopVar}.id === ${stateVar});
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, ${stateVar}, __datasetDataRes]);`;
    });

    if (content.includes('React.useMemo') && !content.includes('import React')) {
        // Add import React
        content = "import React from 'react';\n" + content;
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed ' + file);
});
