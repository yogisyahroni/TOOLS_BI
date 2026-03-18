import React, { useState } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, X, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const FONT_FAMILIES = [
  { name: 'Tableau Book', value: '"Tableau Book", "Segoe UI", sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' }
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '15', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];

interface MenuBarProps {
  editor: ReturnType<typeof useEditor>;
}

const MenuBar = ({ editor }: MenuBarProps) => {
  if (!editor) return null;

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || FONT_FAMILIES[0].value;
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '14pt';
  const currentColor = editor.getAttributes('textStyle').color || '#000000';

  const formatButtonClass = (isActive: boolean) => 
    `p-1 border border-transparent hover:border-gray-300 hover:bg-gray-100 rounded-sm flex items-center justify-center min-w-[24px] ${
      isActive ? 'bg-gray-200 border-gray-400' : 'bg-transparent text-gray-700'
    }`;

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor.chain().focus().setColor(e.target.value).run();
  };

  const insertPlaceholder = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if(e.target.value) {
      editor.chain().focus().insertContent({
        type: 'text',
        text: `<${e.target.value}>`
      }).run();
      e.target.value = ""; // reset
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-gray-300 bg-[#F5F5F5] text-xs" style={{ userSelect: 'none' }}>
      {/* Font Family */}
      <select 
        className="h-6 border border-gray-300 bg-white px-1 outline-none hover:border-blue-400 focus:border-blue-500 cursor-default"
        value={currentFontFamily}
        onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
        title="Font"
      >
        {FONT_FAMILIES.map(font => (
          <option key={font.name} value={font.value}>{font.name}</option>
        ))}
      </select>

      {/* Font Size */}
      <select 
        className="h-6 w-[52px] border border-gray-300 bg-white px-1 outline-none hover:border-blue-400 focus:border-blue-500 cursor-default"
        value={currentFontSize.replace('pt', '')}
        onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()}
        title="Font Size"
      >
        {FONT_SIZES.map(size => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-300 mx-0.5" />

      {/* Formatting */}
      <div className="flex items-center gap-0.5">
        <button 
          onClick={() => editor.chain().focus().toggleBold().run()} 
          className={formatButtonClass(editor.isActive('bold'))}
          title="Bold"
        >
          <Bold size={14} className="font-bold text-black" strokeWidth={3} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          className={formatButtonClass(editor.isActive('italic'))}
          title="Italic"
        >
          <Italic size={14} className="italic text-black" strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleUnderline().run()} 
          className={formatButtonClass(editor.isActive('underline'))}
          title="Underline"
        >
          <UnderlineIcon size={14} className="text-black" strokeWidth={2.5} />
        </button>
      </div>

      {/* Color Picker Native */}
      <div className="flex items-center ml-0.5 relative group">
        <div className="flex items-center h-6 px-0.5 border border-transparent hover:border-gray-300 hover:bg-gray-100 rounded-sm overflow-hidden cursor-pointer" title="Font Color">
          <input 
            type="color" 
            value={currentColor} 
            onChange={handleColorChange}
            className="w-5 h-5 p-0 border-0 cursor-pointer bg-transparent"
          />
          <div className="px-0.5 text-gray-500 text-[10px]">▼</div>
        </div>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-0.5" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        <button 
          onClick={() => editor.chain().focus().setTextAlign('left').run()} 
          className={`p-1 border flex items-center justify-center min-w-[24px] ${editor.isActive({ textAlign: 'left' }) ? 'bg-white border-red-400 text-black shadow-sm' : 'border-transparent hover:border-gray-300 hover:bg-gray-100 text-gray-600'}`}
          title="Align Left"
        >
          <AlignLeft size={14} />
        </button>
        <button 
          onClick={() => editor.chain().focus().setTextAlign('center').run()} 
          className={`p-1 border flex items-center justify-center min-w-[24px] ${editor.isActive({ textAlign: 'center' }) ? 'bg-white border-red-400 text-black shadow-sm' : 'border-transparent hover:border-gray-300 hover:bg-gray-100 text-gray-600'}`}
          title="Align Center"
        >
          <AlignCenter size={14} />
        </button>
        <button 
          onClick={() => editor.chain().focus().setTextAlign('right').run()} 
          className={`p-1 border flex items-center justify-center min-w-[24px] ${editor.isActive({ textAlign: 'right' }) ? 'bg-white border-red-400 text-black shadow-sm' : 'border-transparent hover:border-gray-300 hover:bg-gray-100 text-gray-600'}`}
          title="Align Right"
        >
          <AlignRight size={14} />
        </button>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-0.5" />

      {/* Insert Dropdown */}
      <div className="flex items-center gap-1">
        <select 
          className="h-6 border border-gray-300 bg-white px-1 outline-none hover:border-blue-400 focus:border-blue-500 w-20 cursor-default"
          onChange={insertPlaceholder}
          defaultValue=""
          title="Insert Placeholder"
        >
          <option value="" disabled>Insert ▼</option>
          <option value="Sheet Name">Sheet Name</option>
          <option value="Workbook Name">Workbook Name</option>
          <option value="Data Update Time">Data Update Time</option>
          <option value="Full Name">Full Name</option>
          <option value="User Name">User Name</option>
        </select>
        
        <button 
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} 
          className="p-1 border border-transparent hover:border-gray-300 hover:bg-gray-100 rounded-sm text-red-600 min-w-[24px] flex items-center justify-center"
          title="Clear Formatting"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({ content, onChange, placeholder = 'Start typing...', minHeight = '300px' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose dark:prose-invert max-w-none focus:outline-none p-2 text-[#333333]`,
        style: `font-family: Arial, sans-serif; font-size: 14pt; min-height: ${minHeight};`
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="border border-gray-400 flex flex-col h-full bg-white text-sm" style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)' }}>
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto bg-[#fffff8]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
