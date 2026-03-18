import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
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
                    
                    // Create a distinctive chart placeholder
                    const chartHtml = `
                        <div data-chart-id="${parsed.chartId}" contenteditable="false" class="p-6 my-4 border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center min-h-[250px] border-l-4 border-l-primary cursor-default user-select-none">
                            <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                            </div>
                            <span class="text-lg font-semibold text-foreground mb-1">${parsed.title}</span>
                            <span class="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md mt-2">${parsed.type} Chart</span>
                        </div><p></p>
                    `;

                    if (coordinates) {
                        editor.chain().focus().insertContentAt(coordinates.pos, chartHtml).run();
                    } else {
                        editor.chain().focus().insertContent(chartHtml).run();
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
