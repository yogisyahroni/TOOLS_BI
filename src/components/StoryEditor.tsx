import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEditor, EditorContent, BubbleMenu, NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, List, ListOrdered, Quote, Heading2, ImageIcon, Link as LinkIcon, Loader2, GripHorizontal, AlignLeft, AlignCenter, AlignRight, Underline as UnderlineIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useCharts, useDatasetData } from '@/hooks/useApi';
import { ChartRenderer } from './ChartRenderer';

interface StoryEditorProps {
    content: string;
    onChange: (content: string) => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
    if (!editor) {
        return null;
    }

    const addImage = () => {
        const url = window.prompt('URL Image:');
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    };

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL Link:', previousUrl);
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    return (
        <div className="flex flex-wrap items-center gap-1 p-2 border rounded-md shadow-md border-border bg-card">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={editor.isActive('bold') ? 'bg-muted' : ''}
            >
                <Bold className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={editor.isActive('italic') ? 'bg-muted' : ''}
            >
                <Italic className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={editor.isActive('heading', { level: 2 }) ? 'bg-muted' : ''}
            >
                <Heading2 className="w-4 h-4" />
            </Button>
            <div className="w-px h-4 mx-1 bg-border" />
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={editor.isActive('bulletList') ? 'bg-muted' : ''}
            >
                <List className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={editor.isActive('orderedList') ? 'bg-muted' : ''}
            >
                <ListOrdered className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={editor.isActive('blockquote') ? 'bg-muted' : ''}
            >
                <Quote className="w-4 h-4" />
            </Button>
            <div className="w-px h-4 mx-1 bg-border" />
            <Button variant="ghost" size="icon" onClick={setLink} className={editor.isActive('link') ? 'bg-muted' : ''}>
                <LinkIcon className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={addImage}>
                <ImageIcon className="w-4 h-4" />
            </Button>
        </div>
    );
};

const ResizableChartComponent = ({ node, updateAttributes, selected }: NodeViewProps) => {
    const { chartId } = node.attrs;
    const { data: savedCharts = [] } = useCharts();
    const chart = savedCharts.find((c: any) => String(c.id) === String(chartId));
    const datasetId = chart?.datasetId || '';
    
    // Fetch dataset data for this specific chart
    const { data: datasetDataRes, isLoading } = useDatasetData(datasetId, { limit: 10000 });
    const ds = React.useMemo(() => {
        return { data: datasetDataRes?.data || [] };
    }, [datasetDataRes]);

    // Resize state
    const [isResizing, setIsResizing] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const startWidth = useRef(0);
    const startHeight = useRef(0);

    // Drag (Move) state
    const [isDragging, setIsDragging] = useState(false);
    const dragStartX = useRef(0);
    const dragStartY = useRef(0);
    const startNodeX = useRef(0);
    const startNodeY = useRef(0);

    // Resize Handlers
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        startX.current = e.clientX;
        startY.current = e.clientY;
        startWidth.current = parseInt(node.attrs.width, 10) || 250;
        startHeight.current = parseInt(node.attrs.height, 10) || 150;
    }, [node.attrs.width, node.attrs.height]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX.current;
        const deltaY = e.clientY - startY.current;
        
        const newWidth = Math.max(150, startWidth.current + deltaX);
        const newHeight = Math.max(100, startHeight.current + deltaY);
        
        updateAttributes({
            width: `${newWidth}px`,
            height: `${newHeight}px`
        });
    }, [isResizing, updateAttributes]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
    }, []);

    // Drag handlers
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        // Prevent drag when clicking on resize handle
        if ((e.target as HTMLElement).closest('.resize-handle')) return;
        
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        dragStartX.current = e.clientX;
        dragStartY.current = e.clientY;
        startNodeX.current = parseInt(node.attrs.x, 10) || 0;
        startNodeY.current = parseInt(node.attrs.y, 10) || 0;
        
        // Bring to front
        updateAttributes({ zIndex: Date.now() % 100000 });
    }, [node.attrs.x, node.attrs.y, updateAttributes]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - dragStartX.current;
        const deltaY = e.clientY - dragStartY.current;
        
        // Prevent dragging above top of canvas
        const newX = Math.max(0, startNodeX.current + deltaX);
        const newY = Math.max(0, startNodeY.current + deltaY);
        
        updateAttributes({
            x: `${newX}px`,
            y: `${newY}px`
        });
    }, [isDragging, updateAttributes]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Attach/Detach listeners
    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
        } else if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }
        
        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isResizing, isDragging, handleResizeMove, handleResizeEnd, handleDragMove, handleDragEnd]);

    return (
        <NodeViewWrapper 
            className="react-component-wrapper absolute"
            style={{ 
                left: node.attrs.x, 
                top: node.attrs.y,
                width: node.attrs.width, 
                height: node.attrs.height,
                zIndex: isDragging ? 50 : (selected ? 40 : node.attrs.zIndex)
            }}
        >
            <div 
                onMouseDown={handleDragStart}
                data-chart-id={node.attrs.chartId}
                data-chart-title={node.attrs.title}
                data-chart-type={node.attrs.type}
                data-chart-width={node.attrs.width}
                data-chart-height={node.attrs.height}
                data-chart-x={node.attrs.x}
                data-chart-y={node.attrs.y}
                data-chart-z={node.attrs.zIndex}
                className={`w-full h-full group relative p-6 border rounded-xl shadow-sm flex flex-col items-center justify-center border-l-4 border-l-primary select-none cursor-move transition-shadow ${selected || isDragging ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-card/95 backdrop-blur-sm shadow-lg' : 'bg-card/90 backdrop-blur-sm'}`}
            >
                <div className="flex-1 w-full h-full flex flex-col pointer-events-none overflow-hidden p-2">
                    {isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                            <span className="text-sm text-muted-foreground">Loading chart data...</span>
                        </div>
                    ) : chart && ds.data.length > 0 ? (
                        <div className="flex-1 w-full h-full relative pointer-events-none">
                            <ChartRenderer
                                chartTitle={chart.title}
                                chartType={chart.type || 'bar'}
                                xAxis={chart.xAxis}
                                yAxis={chart.yAxis}
                                groupBy={chart.groupBy}
                                dataLimit="100"
                                dataset={ds}
                                numericColumns={[]}
                                categoricalColumns={[]}
                                sortOrder="none"
                                showLegend={true}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                            </div>
                            <span className="text-lg font-semibold text-foreground mb-1 text-center">{node.attrs.title || 'Chart'}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md mt-2 text-center">{node.attrs.type || 'Unknown'} Chart</span>
                        </div>
                    )}
                </div>

                {/* Resize Handle */}
                <div 
                    className="resize-handle absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={handleResizeStart}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M21 15v6h-6"/><path d="M21 21l-7-7"/><path d="M21 9V3h-6"/></svg>
                </div>
            </div>
        </NodeViewWrapper>
    );
};

const ChartNode = Node.create({
    name: 'savedChart',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            chartId: { default: null },
            title: { default: 'Chart' },
            type: { default: 'Unknown' },
            width: { default: '450px' },
            height: { default: '300px' },
            x: { default: '20px' },
            y: { default: '20px' },
            zIndex: { default: 10 }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-chart-id]',
                getAttrs: (node) => {
                    if (typeof node === 'string') return {};
                    return {
                        chartId: node.getAttribute('data-chart-id'),
                        title: node.getAttribute('data-chart-title'),
                        type: node.getAttribute('data-chart-type'),
                        width: node.getAttribute('data-chart-width') || '450px',
                        height: node.getAttribute('data-chart-height') || '300px',
                        x: node.getAttribute('data-chart-x') || '20px',
                        y: node.getAttribute('data-chart-y') || '20px',
                        zIndex: parseInt(node.getAttribute('data-chart-z') || '10', 10),
                    };
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                'data-chart-id': HTMLAttributes.chartId,
                'data-chart-title': HTMLAttributes.title,
                'data-chart-type': HTMLAttributes.type,
                'data-chart-width': HTMLAttributes.width,
                'data-chart-height': HTMLAttributes.height,
                'data-chart-x': HTMLAttributes.x,
                'data-chart-y': HTMLAttributes.y,
                'data-chart-z': HTMLAttributes.zIndex,
                style: `position: absolute; left: ${HTMLAttributes.x}; top: ${HTMLAttributes.y}; z-index: ${HTMLAttributes.zIndex}; width: ${HTMLAttributes.width}; height: ${HTMLAttributes.height}; max-width: 100%; border: 1px solid var(--border); border-radius: 0.75rem; background-color: rgba(var(--card), 0.95); backdrop-filter: blur(4px); flex-direction: column; align-items: center; justify-content: center; display: flex; text-align: center; border-left: 4px solid var(--primary); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);`,
                class: 'saved-chart-placeholder select-none cursor-move',
                contenteditable: 'false'
            }),
            [
                'div',
                { style: 'width: 3rem; height: 3rem; border-radius: 9999px; background-color: hsl(var(--primary)/0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem;' },
                ['svg', { xmlns: 'http://www.w3.org/2000/svg', width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'color: hsl(var(--primary));' }, 
                    ['path', { d: 'M3 3v18h18' }],
                    ['path', { d: 'm19 9-5 5-4-4-3 3' }]
                ]
            ],
            ['span', { style: 'font-size: 1.125rem; font-weight: 600; color: hsl(var(--foreground)); margin-bottom: 0.25rem;' }, HTMLAttributes.title || 'Chart'],
            ['span', { style: 'font-size: 0.75rem; color: hsl(var(--muted-foreground)); background-color: hsl(var(--muted)); padding: 0.25rem 0.5rem; border-radius: 0.375rem; margin-top: 0.5rem;' }, (HTMLAttributes.type || 'Unknown') + ' Chart']
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ResizableChartComponent);
    }
});

const TextModalEditor = ({ initialContent, onChange }: { initialContent: string, onChange: (c: string) => void }) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextStyle,
            Color,
            FontFamily,
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content: initialContent,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] border border-border rounded-md p-4'
            }
        }
    });

    if (!editor) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1 p-2 border rounded-md shadow-sm border-border bg-card">
                <Select
                    value={editor.getAttributes('textStyle').fontFamily || 'Inter'}
                    onValueChange={(val) => editor.chain().focus().setFontFamily(val).run()}
                >
                    <SelectTrigger className="w-[140px] h-8">
                        <SelectValue placeholder="Font" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                        <SelectItem value="Inter">Inter</SelectItem>
                        <SelectItem value="Arial">Arial</SelectItem>
                        <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                        <SelectItem value="Courier New">Courier New</SelectItem>
                        <SelectItem value="Tableau Book">Tableau Book</SelectItem>
                        <SelectItem value="Tableau Bold">Tableau Bold</SelectItem>
                        <SelectItem value="Trebuchet MS">Trebuchet MS</SelectItem>
                        <SelectItem value="Verdana">Verdana</SelectItem>
                        <SelectItem value="Roboto">Roboto</SelectItem>
                        <SelectItem value="Open Sans">Open Sans</SelectItem>
                        <SelectItem value="Lato">Lato</SelectItem>
                        <SelectItem value="Montserrat">Montserrat</SelectItem>
                        <SelectItem value="Poppins">Poppins</SelectItem>
                        <SelectItem value="Nunito">Nunito</SelectItem>
                        <SelectItem value="Playfair Display">Playfair Display</SelectItem>
                        <SelectItem value="Merriweather">Merriweather</SelectItem>
                        <SelectItem value="Georgia">Georgia</SelectItem>
                        <SelectItem value="Comic Sans MS">Comic Sans MS</SelectItem>
                        <SelectItem value="Impact">Impact</SelectItem>
                        <SelectItem value="Pacifico">Pacifico</SelectItem>
                        <SelectItem value="Caveat">Caveat</SelectItem>
                        <SelectItem value="Fira Code">Fira Code</SelectItem>
                        <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
                    </SelectContent>
                </Select>

                <div className="w-px h-4 mx-1 bg-border" />
                
                <input 
                    type="color" 
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer shrink-0"
                    value={editor.getAttributes('textStyle').color || '#000000'}
                    onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                />

                <div className="w-px h-4 mx-1 bg-border" />

                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive('bold') ? 'true' : 'false'}>
                    <Bold className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleItalic().run()} data-active={editor.isActive('italic') ? 'true' : 'false'}>
                    <Italic className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().toggleUnderline().run()} data-active={editor.isActive('underline') ? 'true' : 'false'}>
                    <UnderlineIcon className="w-4 h-4" />
                </Button>

                <div className="w-px h-4 mx-1 bg-border" />

                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().setTextAlign('left').run()} data-active={editor.isActive({ textAlign: 'left' }) ? 'true' : 'false'}>
                    <AlignLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().setTextAlign('center').run()} data-active={editor.isActive({ textAlign: 'center' }) ? 'true' : 'false'}>
                    <AlignCenter className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor.chain().focus().setTextAlign('right').run()} data-active={editor.isActive({ textAlign: 'right' }) ? 'true' : 'false'}>
                    <AlignRight className="w-4 h-4" />
                </Button>
            </div>
            <EditorContent editor={editor} />
        </div>
    );
};

const FloatingTextComponent = ({ node, updateAttributes, selected }: NodeViewProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempContent, setTempContent] = useState(node.attrs.contentHtml);

    // Resize state
    const [isResizing, setIsResizing] = useState(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // Drag (Move) state
    const [isDragging, setIsDragging] = useState(false);
    const dragStartX = useRef(0);
    const dragStartY = useRef(0);
    const startNodeX = useRef(0);
    const startNodeY = useRef(0);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        startX.current = e.clientX;
        const widthVal = node.attrs.width;
        startWidth.current = parseInt(widthVal === 'auto' ? '300' : widthVal, 10) || 300;
    }, [node.attrs.width]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        const deltaX = e.clientX - startX.current;
        const newWidth = Math.max(100, startWidth.current + deltaX);
        updateAttributes({ width: `${newWidth}px` });
    }, [isResizing, updateAttributes]);

    const handleResizeEnd = useCallback(() => setIsResizing(false), []);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.resize-handle')) return;
        
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        dragStartX.current = e.clientX;
        dragStartY.current = e.clientY;
        startNodeX.current = parseInt(node.attrs.x, 10) || 0;
        startNodeY.current = parseInt(node.attrs.y, 10) || 0;

        // Bring to front
        updateAttributes({ zIndex: Date.now() % 100000 });
    }, [node.attrs.x, node.attrs.y, updateAttributes]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        const deltaX = e.clientX - dragStartX.current;
        const deltaY = e.clientY - dragStartY.current;
        const newX = Math.max(0, startNodeX.current + deltaX);
        const newY = Math.max(0, startNodeY.current + deltaY);
        updateAttributes({ x: `${newX}px`, y: `${newY}px` });
    }, [isDragging, updateAttributes]);

    const handleDragEnd = useCallback(() => setIsDragging(false), []);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
        } else if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isResizing, isDragging, handleResizeMove, handleResizeEnd, handleDragMove, handleDragEnd]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setTempContent(node.attrs.contentHtml);
        setIsEditing(true);
    };

    return (
        <NodeViewWrapper 
            className="react-component-wrapper absolute"
            style={{ 
                left: node.attrs.x, 
                top: node.attrs.y,
                width: node.attrs.width, 
                height: node.attrs.height,
                zIndex: isDragging ? 50 : (selected ? 40 : node.attrs.zIndex)
            }}
        >
            <div 
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleDragStart}
                className={`group relative p-4 border rounded-md transition-colors cursor-move ${selected || isDragging ? 'ring-2 ring-primary bg-card/50' : 'border-transparent hover:border-border bg-transparent'}`}
                style={{ width: '100%', minHeight: '40px' }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-3 opacity-0 group-hover:opacity-100 p-1 bg-card border rounded-full shadow-sm cursor-grab">
                    <GripHorizontal className="w-3 h-3 text-muted-foreground" />
                </div>

                <div 
                    className="w-full h-full prose prose-sm dark:prose-invert max-w-none pointer-events-none"
                    dangerouslySetInnerHTML={{ __html: node.attrs.contentHtml || '<p class="text-muted-foreground">Empty text box...</p>' }}
                />

                <div 
                    className="resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-e-resize flex items-center justify-center p-1 opacity-0 group-hover:opacity-100"
                    onMouseDown={handleResizeStart}
                >
                    <div className="w-1 h-3 border-r-2 border-primary/50" />
                </div>
            </div>

            <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Text</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <TextModalEditor 
                            initialContent={tempContent} 
                            onChange={setTempContent} 
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button onClick={() => {
                            updateAttributes({ contentHtml: tempContent });
                            setIsEditing(false);
                        }}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </NodeViewWrapper>
    );
};

const FloatingTextNode = Node.create({
    name: 'floatingText',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            contentHtml: { default: '<p>Edit me...</p>' },
            width: { default: '300px' },
            height: { default: 'auto' },
            x: { default: '20px' },
            y: { default: '20px' },
            zIndex: { default: 20 }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-floating-text]',
                getAttrs: (node) => {
                    if (typeof node === 'string') return {};
                    return {
                        contentHtml: node.getAttribute('data-content-html') || '<p>Edit me...</p>',
                        width: node.getAttribute('data-width') || '300px',
                        height: node.getAttribute('data-height') || 'auto',
                        x: node.getAttribute('data-x') || '20px',
                        y: node.getAttribute('data-y') || '20px',
                        zIndex: parseInt(node.getAttribute('data-z') || '20', 10),
                    };
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                'data-floating-text': 'true',
                'data-content-html': HTMLAttributes.contentHtml,
                'data-width': HTMLAttributes.width,
                'data-height': HTMLAttributes.height,
                'data-x': HTMLAttributes.x,
                'data-y': HTMLAttributes.y,
                'data-z': HTMLAttributes.zIndex,
                style: `position: absolute; left: ${HTMLAttributes.x}; top: ${HTMLAttributes.y}; z-index: ${HTMLAttributes.zIndex}; width: ${HTMLAttributes.width}; height: ${HTMLAttributes.height}; display: flex; flex-direction: column;`,
                class: 'floating-text-placeholder select-none cursor-move',
                contenteditable: 'false'
            }),
            ['div', { class: 'prose prose-sm max-w-none' }]
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(FloatingTextComponent);
    }
});

export function StoryEditor({ content, onChange }: StoryEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({
                HTMLAttributes: { class: 'rounded-md max-w-full my-4 border border-border shadow-sm' },
            }),
            Link.configure({ openOnClick: false }),
            Placeholder.configure({
                placeholder: 'Write your story narrative here. You can paste image URLs, format text, and add insights...',
            }),
            ChartNode,
            FloatingTextNode,
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] h-full relative'
            }
        }
    });

    const handleDragOver = (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/json')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        if (!editor) return;
        
        try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.source === 'saved-chart') {
                    e.preventDefault();
                    
                    const editorEl = editor.view.dom as HTMLElement;
                    const editorBounds = editorEl.getBoundingClientRect();
                    // Kalkulasi posisi x dan y relatif terhadap container editor
                    const dropX = e.clientX - editorBounds.left;
                    const dropY = e.clientY - editorBounds.top;
                    
                    const chartNodeData = {
                        type: 'savedChart',
                        attrs: {
                            chartId: parsed.chartId,
                            title: parsed.title,
                            type: parsed.type,
                            width: '450px',
                            height: '300px',
                            x: `${Math.max(0, dropX)}px`,
                            y: `${Math.max(0, dropY)}px`,
                            zIndex: 10
                        }
                    };

                    // Gunakan setTextSelection untuk titik drop, baru insertContent agar resolusi node block diizinkan TipTap
                    const coordinates = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
                    let chain = editor.chain().focus();
                    if (coordinates) {
                        try {
                            chain = chain.setTextSelection(coordinates.pos);
                        } catch (e) {
                            // ignore if pos is invalid for text selection
                        }
                    }
                    chain.insertContent(chartNodeData).run();
                } else if (parsed.source === 'text-element') {
                    e.preventDefault();
                    
                    const editorEl = editor.view.dom as HTMLElement;
                    const editorBounds = editorEl.getBoundingClientRect();
                    const dropX = e.clientX - editorBounds.left;
                    const dropY = e.clientY - editorBounds.top;
                    
                    let defaultContent = '<p>Write your text here...</p>';
                    if (parsed.type === 'heading') {
                        defaultContent = '<h2>Heading</h2>';
                    }

                    const textNodeData = {
                        type: 'floatingText',
                        attrs: {
                            contentHtml: defaultContent,
                            width: '300px',
                            height: 'auto',
                            x: `${Math.max(0, dropX)}px`,
                            y: `${Math.max(0, dropY)}px`,
                            zIndex: 20
                        }
                    };

                    const coordinates = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
                    let chain = editor.chain().focus();
                    if (coordinates) {
                        try {
                            chain = chain.setTextSelection(coordinates.pos);
                        } catch (e) {
                            // ignore
                        }
                    }
                    chain.insertContent(textNodeData).run();
                }
            }
        } catch (err) {
            console.error("Failed to parse dropped data", err);
        }
    };

    return (
        <div className="flex flex-col flex-1 w-full bg-background relative h-full">
            {editor && (
                <BubbleMenu 
                    editor={editor} 
                    tippyOptions={{ duration: 100 }} 
                    className="z-50"
                    shouldShow={({ editor, state }) => {
                        // Jangan tampilkan jika block yang dipilih adalah savedChart
                        if (editor.isActive('savedChart')) {
                            return false;
                        }
                        return !state.selection.empty;
                    }}
                >
                    <MenuBar editor={editor} />
                </BubbleMenu>
            )}
            <div 
                className="flex-1 p-4 overflow-y-auto border rounded-xl border-border bg-card h-full min-h-full"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <EditorContent editor={editor} className="h-full min-h-full" />
            </div>
        </div>
    );
}
