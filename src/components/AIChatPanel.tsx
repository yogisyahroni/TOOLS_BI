import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Loader2, Bot, User, AlertCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAIConfig } from '@/hooks/useApi';
import { callAI } from '@/lib/aiService';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  systemPrompt: string;
  placeholder?: string;
  title?: string;
  onAIResponse?: (response: string) => void;
  className?: string;
}

export function AIChatPanel({
  systemPrompt,
  placeholder = 'Tanyakan sesuatu ke AI...',
  title = 'AI Assistant',
  onAIResponse,
  className,
}: AIChatPanelProps) {
  const { data: aiConfig } = useAIConfig();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMsg.content },
    ];

    const response = await callAI(chatMessages);

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response.error || response.content || 'Tidak ada response.',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(false);

    if (!response.error && response.content && onAIResponse) {
      onAIResponse(response.content);
    }
  };

  const configured = !!aiConfig?.provider;

  return (
    <div className={cn('bg-card rounded-xl border border-border shadow-card flex flex-col', className)}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-sm">{title}</span>
          {configured && (
            <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full">Connected</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col overflow-hidden"
          >
            {!configured ? (
              <div className="p-6 text-center">
                <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">AI Belum Dikonfigurasi</p>
                <p className="text-xs text-muted-foreground">
                  Silakan setup API key di halaman <a href="/settings" className="text-primary hover:underline">Settings</a> terlebih dahulu.
                </p>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[300px] min-h-[150px]">
                  {messages.length === 0 && (
                    <div className="text-center py-6">
                      <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Mulai percakapan dengan AI assistant</p>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        msg.role === 'user'
                          ? 'bg-primary/20 text-foreground'
                          : 'bg-muted/50 text-foreground'
                      )}>
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{msg.content}</pre>
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3 text-primary-foreground" />
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-border">
                  <div className="flex gap-2">
                    <Textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder={placeholder}
                      className="min-h-[40px] max-h-[80px] resize-none text-xs bg-muted/30 border-border"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    />
                    <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="sm" className="gradient-primary text-primary-foreground self-end">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
