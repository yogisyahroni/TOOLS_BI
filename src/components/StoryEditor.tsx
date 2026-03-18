import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEditor, EditorContent, BubbleMenu, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Quote, Heading2, ImageIcon, Link as LinkIcon } from 'lucide-react';
import { Button } from './ui/button';

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

const ChartComponent = ({ node, updateAttributes, selected }: any) => {
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startX = useRef(0);
    const startY = useRef(0);
    const startWidth = useRef(0);
    const startHeight = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        startX.current = e.clientX;
        startY.current = e.clientY;
        if (containerRef.current) {
            startWidth.current = containerRef.current.offsetWidth;
            startHeight.current = containerRef.current.offsetHeight;
        }
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX.current;
        const deltaY = e.clientY - startY.current;
        
        const newWidth = Math.max(250, startWidth.current + deltaX);
        const newHeight = Math.max(150, startHeight.current + deltaY);
        
        updateAttributes({
            width: `${newWidth}px`,
            height: `${newHeight}px`
        });
    }, [isResizing, updateAttributes]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <NodeViewWrapper className="react-component-wrapper cursor-default my-4 flex justify-center">
            <div 
                ref={containerRef}
                style={{ width: node.attrs.width, height: node.attrs.height }}
                data-chart-id={node.attrs.chartId}
                data-chart-title={node.attrs.title}
                data-chart-type={node.attrs.type}
                data-chart-width={node.attrs.width}
                data-chart-height={node.attrs.height}
                className={`group relative p-6 border rounded-xl shadow-sm flex flex-col items-center justify-center border-l-4 border-l-primary select-none transition-shadow ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-card/90' : 'bg-card'}`}
            >
                <div className="flex-1 w-full flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                    </div>
                    <span className="text-lg font-semibold text-foreground mb-1 text-center">{node.attrs.title || 'Chart'}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md mt-2 text-center">{node.attrs.type || 'Unknown'} Chart</span>
                </div>

                {/* Resize Handle */}
                <div 
                    className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={handleMouseDown}
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
            width: { default: '100%' },
            height: { default: '250px' }
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
                        width: node.getAttribute('data-chart-width') || '100%',
                        height: node.getAttribute('data-chart-height') || '250px',
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
                style: `width: ${HTMLAttributes.width}; height: ${HTMLAttributes.height}; max-width: 100%; border: 1px solid var(--border); border-radius: 0.75rem; background-color: var(--card); flex-direction: column; align-items: center; justify-content: center; display: flex; text-align: center; border-left: 4px solid var(--primary); margin: 1rem auto; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);`,
                class: 'saved-chart-placeholder select-none',
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
        return ReactNodeViewRenderer(ChartComponent);
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
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px]'
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
                    
                    const coordinates = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
                    
                    const chartNodeData = {
                        type: 'savedChart',
                        attrs: {
                            chartId: parsed.chartId,
                            title: parsed.title,
                            type: parsed.type,
                            width: '100%',
                            height: '250px'
                        }
                    };

                    if (coordinates) {
                        editor.chain().focus().insertContentAt(coordinates.pos, chartNodeData).run();
                        // Add a new paragraph after
                        editor.chain().focus().insertContentAt(coordinates.pos + 1, '<p></p>').run();
                    } else {
                        editor.chain().focus().insertContent(chartNodeData).run();
                        editor.chain().focus().insertContent('<p></p>').run();
                    }
                } else if (parsed.source === 'text-element') {
                    e.preventDefault();
                    const coordinates = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
                    
                    let textHtml = '<p>Write your text here...</p>';
                    if (parsed.type === 'heading') {
                        textHtml = '<h2>Heading</h2><p>Write your text here...</p>';
                    }

                    if (coordinates) {
                        editor.chain().focus().insertContentAt(coordinates.pos, textHtml).run();
                    } else {
                        editor.chain().focus().insertContent(textHtml).run();
                    }
                }
            }
        } catch (err) {
            console.error("Failed to parse dropped data", err);
        }
    };

    return (
        <div className="flex flex-col flex-1 w-full bg-background relative h-full">
            {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="z-50">
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
