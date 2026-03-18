import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHtml: string;
  onSave: (html: string) => void;
}

export function TextEditorModal({ isOpen, onClose, initialHtml, onSave }: TextEditorModalProps) {
  const [content, setContent] = useState(initialHtml);

  // Update content when initialHtml changes
  useEffect(() => {
    if (isOpen) {
      setContent(initialHtml);
    }
  }, [initialHtml, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* 
        Custom DialogContent class to remove heavy paddings, standard corner rounding, and look more like a native Tableau tool window.
      */}
      <DialogContent className="sm:max-w-[800px] h-[500px] flex flex-col p-0 gap-0 border-gray-400 bg-[#F0F0F0] overflow-hidden rounded-sm shadow-xl">
        
        {/* Header styling to mimic a native window title bar or simple Tableau dialog header */}
        <DialogHeader className="px-3 py-2 bg-white flex flex-row items-center justify-between flex-none border-b border-gray-300">
          <DialogTitle className="text-[13px] font-normal text-gray-800 tracking-wide select-none">
            Edit Text
          </DialogTitle>
          {/* Close button provided by Dialog component automatically via DialogContent, but we can rely on that or add our own. 
              Usually Radix DialogContent has an absolute close button. The padding makes sure title doesn't overlap it. */}
        </DialogHeader>
        
        {/* Editor Body */}
        <div className="flex-1 overflow-hidden p-2 flex flex-col bg-[#F0F0F0]">
          <RichTextEditor 
            content={content} 
            onChange={setContent}
            minHeight="100%" 
          />
        </div>
        
        {/* Footer with classic buttons aligned right */}
        <div className="px-3 py-2.5 flex-none flex justify-end gap-2 bg-[#F0F0F0]">
          <button 
            onClick={onClose}
            className="px-6 py-1 text-xs border border-gray-400 bg-white hover:bg-gray-50 hover:border-blue-500 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(content)}
            className="px-6 py-1 text-xs border border-gray-400 bg-white hover:bg-gray-50 hover:border-blue-500 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            OK
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
