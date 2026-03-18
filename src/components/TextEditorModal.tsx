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
      <DialogContent className="sm:max-w-[700px] h-[550px] flex flex-col p-6 gap-4 border-gray-200 bg-white overflow-hidden rounded-lg shadow-xl">
        
        <DialogHeader className="flex flex-row items-center justify-between flex-none pb-2 border-b border-gray-100">
          <DialogTitle className="text-lg font-semibold text-gray-900 tracking-tight">
            Edit Text
          </DialogTitle>
        </DialogHeader>
        
        {/* Editor Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <RichTextEditor 
            content={content} 
            onChange={setContent}
            minHeight="100%" 
          />
        </div>
        
        {/* Footer */}
        <div className="pt-4 flex-none flex justify-end gap-3 border-t border-gray-100">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(content)}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md transition-colors shadow-sm"
          >
            OK
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
