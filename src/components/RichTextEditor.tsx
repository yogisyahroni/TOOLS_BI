import React from 'react';
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
  { name: 'Tableau Bold', value: '"Tableau Bold", "Segoe UI", sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Roboto', value: 'Roboto, sans-serif' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif' },
  { name: 'Lato', value: 'Lato, sans-serif' },
  { name: 'Montserrat', value: 'Montserrat, sans-serif' },
  { name: 'Poppins', value: 'Poppins, sans-serif' },
  { name: 'Nunito', value: 'Nunito, sans-serif' },
  { name: 'Playfair Display', value: '"Playfair Display", serif' },
  { name: 'Merriweather', value: 'Merriweather, serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { name: 'Impact', value: 'Impact, sans-serif' },
  { name: 'Pacifico', value: 'Pacifico, cursive' },
  { name: 'Caveat', value: 'Caveat, cursive' },
  { name: 'Fira Code', value: '"Fira Code", monospace' },
  { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' }
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '15', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];

interface MenuBarProps {
  editor: ReturnType<typeof useEditor>;
}

const MenuBar = ({ editor }: MenuBarProps) => {
  if (!editor) return null;

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || FONT_FAMILIES[0].value;
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '15pt';
  const currentColor = editor.getAttributes('textStyle').color || '#000000';

  const formatButtonClass = (isActive: boolean) => 
    `p-1.5 rounded-md flex items-center justify-center min-w-[32px] transition-colors focus:outline-none ${
      isActive 
        ? 'bg-blue-100 text-blue-700' 
        : 'bg-transparent hover:bg-gray-200 text-gray-700'
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
    <div className="flex flex-wrap items-center gap-2 p-2 border-b border-gray-100 bg-gray-50/50">
      
      {/* Font Family */}
      <select 
        className="h-8 w-[140px] text-sm border border-gray-200 bg-white px-2 outline-none hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md transition-shadow cursor-pointer"
        value={currentFontFamily}
        onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
        title="Font"
      >
        {FONT_FAMILIES.map(font => (
          <option key={font.name} value={font.value} style={{fontFamily: font.value}}>{font.name}</option>
        ))}
      </select>

      {/* Font Size */}
      <select 
        className="h-8 w-[64px] text-sm border border-gray-200 bg-white px-2 outline-none hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md transition-shadow cursor-pointer"
        value={currentFontSize.replace('pt', '')}
        onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()}
        title="Font Size"
      >
        {FONT_SIZES.map(size => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>

      <div className="w-[1px] h-6 bg-gray-300 mx-1" />

      {/* Formatting */}
      <div className="flex items-center gap-1">
        <button 
          onClick={() => editor.chain().focus().toggleBold().run()} 
          className={formatButtonClass(editor.isActive('bold'))}
          title="Bold"
        >
          <Bold size={16} strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          className={formatButtonClass(editor.isActive('italic'))}
          title="Italic"
        >
          <Italic size={16} strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => editor.chain().focus().toggleUnderline().run()} 
          className={formatButtonClass(editor.isActive('underline'))}
          title="Underline"
        >
          <UnderlineIcon size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div className="w-[1px] h-6 bg-gray-300 mx-1" />

      {/* Color Picker Native */}
      <div className="flex items-center group relative" title="Text Color">
        <div className="p-1 w-8 h-8 rounded-md flex items-center justify-center border border-transparent hover:bg-gray-200 transition-colors cursor-pointer relative overflow-hidden">
          <input 
            type="color" 
            value={currentColor} 
            onChange={handleColorChange}
            className="absolute -inset-2 w-16 h-16 cursor-pointer opacity-0"
          />
          <div className="w-4 h-4 rounded-sm border border-gray-200 shadow-sm pointer-events-none" style={{ backgroundColor: currentColor }}></div>
        </div>
      </div>

      <div className="w-[1px] h-6 bg-gray-300 mx-1" />

      {/* Alignment */}
      <div className="flex items-center gap-1">
        <button 
          onClick={() => editor.chain().focus().setTextAlign('left').run()} 
          className={formatButtonClass(editor.isActive({ textAlign: 'left' }))}
          title="Align Left"
        >
          <AlignLeft size={16} strokeWidth={2} />
        </button>
        <button 
          onClick={() => editor.chain().focus().setTextAlign('center').run()} 
          className={formatButtonClass(editor.isActive({ textAlign: 'center' }))}
          title="Align Center"
        >
          <AlignCenter size={16} strokeWidth={2} />
        </button>
        <button 
          onClick={() => editor.chain().focus().setTextAlign('right').run()} 
          className={formatButtonClass(editor.isActive({ textAlign: 'right' }))}
          title="Align Right"
        >
          <AlignRight size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="w-[1px] h-6 bg-gray-300 mx-1" />

      {/* Insert Dropdown & Clear */}
      <div className="flex items-center gap-1">
        <select 
          className="h-8 text-sm border border-gray-200 bg-white px-2 outline-none hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-[100px] rounded-md transition-shadow cursor-pointer"
          onChange={insertPlaceholder}
          defaultValue=""
          title="Insert Field Variable"
        >
          <option value="" disabled>Insert</option>
          <option value="Sheet Name">Sheet Name</option>
          <option value="Workbook Name">Workbook Name</option>
          <option value="Data Update Time">Data Update Time</option>
          <option value="Full Name">Full Name</option>
          <option value="User Name">User Name</option>
        </select>
        
        <button 
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} 
          className="ml-1 p-1.5 rounded-md flex items-center justify-center min-w-[32px] text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors focus:outline-none"
          title="Clear Formatting"
        >
          <X size={16} strokeWidth={2.5} />
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
        class: `prose max-w-none focus:outline-none p-4 text-gray-800 leading-relaxed`,
        style: `font-family: Arial, sans-serif; font-size: 15pt; min-height: ${minHeight};`
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="border border-gray-200 rounded-md flex flex-col h-full bg-white overflow-hidden shadow-sm">
      <MenuBar editor={editor} />
      <div className="flex-1 overflow-y-auto bg-white cursor-text" onClick={() => editor?.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
