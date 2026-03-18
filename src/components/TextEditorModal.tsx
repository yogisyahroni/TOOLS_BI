import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-none">
          <DialogTitle className="text-xl">Edit Text Widget</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          <RichTextEditor 
            content={content} 
            onChange={setContent} 
          />
        </div>
        
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-none gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(content)}>
            Save Content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
