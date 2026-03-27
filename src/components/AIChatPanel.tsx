import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, Loader2, Bot, User, AlertCircle, Sparkles, X, Settings2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAIConfig } from '@/hooks/useApi';
import { callAI, callAIStream } from '@/lib/aiService';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

export interface DatasetRecommendation {
  name: string;
  description: string;
  sql: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isJsonArray?: boolean;
  jsonData?: DatasetRecommendation[];
  thought?: string;
}

interface AIChatPanelProps {
  systemPrompt: string;
  placeholder?: string;
  title?: string;
  onAIResponse?: (response: string, jsonRecommendations?: DatasetRecommendation[]) => void;
  onCreateViews?: (recommendations: DatasetRecommendation[]) => void;
  className?: string;
  isCreatingViews?: boolean;
  contextType?: 'sql' | 'chart' | 'report' | 'general';
}

export function AIChatPanel({
  systemPrompt,
  placeholder = 'Ask AI something...',
  title = 'AI Assistant',
  onAIResponse,
  onCreateViews,
  className,
  isCreatingViews = false,
  contextType = 'general',
}: AIChatPanelProps) {
  const { data: aiConfig } = useAIConfig();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [isRefining, setIsRefining] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State for selections inside the AI responses
  const [selectedViews, setSelectedViews] = useState<Record<string, DatasetRecommendation[]>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle auto-resizing for textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const msgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: msgId,
      role: 'assistant',
      content: '', // will be progressively filled
      thought: '', // will be progressively filled
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMsg.content },
    ];

    try {
      const response = await callAIStream(
        chatMessages,
        (chunk) => {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              return { ...m, content: m.content + chunk };
            }
            return m;
          }));
        },
        (thoughtChunk) => {
          setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
              let thoughtContent = '';
              try {
                const parsed = JSON.parse(thoughtChunk);
                // The actual thought from sequential thinking is in parsed.thought
                thoughtContent = parsed.thought || thoughtChunk;
              } catch(e) {
                thoughtContent = thoughtChunk;
              }
              const currentThought = m.thought ? m.thought + '\n\n' : '';
              return { ...m, thought: currentThought + thoughtContent };
            }
            return m;
          }));
        }
      );

      let isJsonArray = false;
      let jsonData: DatasetRecommendation[] | undefined;
      let content = response.error ? response.error : response.content;

      try {
        if (response.content) {
          let jsonStr = response.content;
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          } else {
            const firstBracket = jsonStr.indexOf('[');
            const lastBracket = jsonStr.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
              jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
            }
          }

          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0 && 'sql' in parsed[0] && 'name' in parsed[0]) {
            isJsonArray = true;
            jsonData = parsed;
            setSelectedViews(prev => ({ ...prev, [msgId]: [] }));
          }
        }
      } catch (e) {
        console.warn('AI Parsing failed:', e);
      }

      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          return {
            ...m,
            content: content || m.content,
            isJsonArray,
            jsonData
          };
        }
        return m;
      }));

      setIsLoading(false);

      if (!response.error && response.content && onAIResponse) {
        onAIResponse(response.content, jsonData);
        // Automatically generate 3 suggestions for the next step
        generateSuggestions(response.content);
      }
    } catch (err: any) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          return { ...m, content: m.content + '\n\n[Error: ' + err.message + ']' };
        }
        return m;
      }));
    }
  };

  const configured = !!aiConfig?.hasApiKey;

  const handleToggleSelection = (msgId: string, rec: DatasetRecommendation, isChecked: boolean) => {
    setSelectedViews(prev => {
      const currentSelections = prev[msgId] || [];
      if (isChecked) {
        return { ...prev, [msgId]: [...currentSelections, rec] };
      } else {
        return { ...prev, [msgId]: currentSelections.filter(item => item.name !== rec.name) };
      }
    });
  };

  const handleRefine = async () => {
    if (!input.trim() || isRefining) return;
    setIsRefining(true);

    const refinerPrompt = contextType === 'sql' 
      ? "You are a SQL Expert. Refine this user prompt into a professional, clear, and unambiguous PostgreSQL query request. Focus ONLY on data extraction. DO NOT suggest charts or visualizations. Return ONLY the refined prompt text."
      : "You are a Data Analyst Expert. Refine this user prompt into a professional, clear, and unambiguous data analysis or visualization request. Return ONLY the refined prompt text.";

    try {
      const response = await callAI([
        { role: 'system', content: refinerPrompt },
        { role: 'user', content: `Refine this: ${input}` }
      ]);

      if (response.content) {
        setInput(response.content.trim());
      }
    } catch (err) {
      console.error('Refine failed:', err);
    } finally {
      setIsRefining(false);
    }
  };

  const generateSuggestions = async (lastResponse: string) => {
    try {
      const response = await callAI([
        { role: 'system', content: `Based on the AI's last response, generate 3 very short (max 5 words each) follow-up suggestions for the user. Context: ${contextType}. If SQL context, focus on joins or filters. If Chart context, focus on visualization styles. Return ONLY a JSON string array like ["Suggestion 1", "Suggestion 2", "Suggestion 3"].` },
        { role: 'user', content: lastResponse }
      ]);

      if (response.content) {
        const cleaned = response.content.match(/\[.*\]/s)?.[0] || response.content;
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) setSuggestions(parsed.slice(0, 3));
      }
    } catch (e) {
      console.warn('Suggestions failed:', e);
    }
  };

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
            animate={{ height: '100%', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {!configured ? (
              <div className="p-6 text-center">
                <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">AI Not Configured</p>
                <p className="text-xs text-muted-foreground">
                  Please setup the API key in the <a href="/settings" className="text-primary hover:underline">Settings</a> page first.
                </p>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[250px] max-h-full">
                  {messages.length === 0 && (
                    <div className="text-center py-6">
                      <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Start a conversation with the AI assistant</p>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start fadeIn')}>
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}

                      <div className={cn(
                        'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                        msg.role === 'user'
                          ? 'bg-primary/20 text-foreground'
                          : 'bg-muted/30 text-foreground border border-border shadow-sm font-sans'
                      )}>
                        {msg.thought && (
                           <div className="mb-2 w-full">
                             <details className="group border border-border/50 bg-muted/20 rounded-md">
                               <summary className="flex cursor-pointer items-center justify-between p-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors">
                                 <div className="flex items-center gap-1.5">
                                   <Sparkles className="w-3 h-3 text-primary/70" />
                                   <span>Thinking Process</span>
                                 </div>
                                 <span className="text-[10px] opacity-60 group-open:hidden transition-opacity">
                                   Click to expand
                                 </span>
                               </summary>
                               <div className="p-3 pt-1 border-t border-border/50">
                                  <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground/80 max-h-[300px] overflow-y-auto">
                                    {msg.thought}
                                  </pre>
                               </div>
                             </details>
                           </div>
                        )}
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{msg.content}</pre>

                        {/* Rendering JSON Array recommendations if present */}
                        {msg.isJsonArray && msg.jsonData && (
                          <div className="mt-4 space-y-3">
                            {msg.jsonData.map((rec, idx) => {
                              const isSelected = (selectedViews[msg.id] || []).some(v => v.name === rec.name);
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200 cursor-pointer shadow-sm relative overflow-hidden",
                                    isSelected
                                      ? "border-primary bg-primary/10 shadow-primary/5"
                                      : "border-border bg-card hover:border-primary/50"
                                  )}
                                  onClick={() => handleToggleSelection(msg.id, rec, !isSelected)}
                                >
                                  <div className="mt-0.5 pointer-events-none z-10">
                                    <Checkbox checked={isSelected} className={isSelected ? "data-[state=checked]:bg-primary" : ""} />
                                  </div>
                                  <div className="flex-1 min-w-0 z-10">
                                    <h4 className="font-semibold text-sm text-foreground mb-1 flex items-center gap-1.5 leading-tight">
                                      <Settings2 className="w-4 h-4 text-primary shrink-0" />
                                      {rec.name}
                                    </h4>
                                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                                      {rec.description}
                                    </p>
                                    <div className="bg-background/80 backdrop-blur-sm p-2 rounded-md border border-border/50 text-[10px] font-mono text-foreground/80 overflow-x-auto whitespace-pre">
                                      {rec.sql}
                                    </div>
                                  </div>
                                  {/* Active styling glow */}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
                                  )}
                                </div>
                              );
                            })}

                            {/* Create Selected Views Button */}
                            {onCreateViews && (
                              <div className="pt-3 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-1 flex justify-end z-20">
                                <Button
                                  size="sm"
                                  className={cn(
                                    "text-xs shadow-md transition-all font-medium",
                                    (!selectedViews[msg.id] || selectedViews[msg.id].length === 0)
                                      ? "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                                      : "gradient-primary text-primary-foreground hover:shadow-lg hover:brightness-110"
                                  )}
                                  disabled={!selectedViews[msg.id] || selectedViews[msg.id].length === 0 || isCreatingViews}
                                  onClick={() => onCreateViews(selectedViews[msg.id] || [])}
                                >
                                  {isCreatingViews ? (
                                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating Views...</>
                                  ) : (
                                    <><Plus className="w-3.5 h-3.5 mr-1.5" /> Create {selectedViews[msg.id]?.length || 0} Selected Views <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
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
                <div className="p-3 border-t border-border bg-card">
                  {/* Suggestions area */}
                  {suggestions.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mb-1">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setInput(s); setSuggestions([]); }}
                          className="whitespace-nowrap px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] hover:bg-primary/20 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                      <button onClick={() => setSuggestions([])} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 relative">
                    <div className="relative flex-1">
                      <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={placeholder}
                        className="min-h-[40px] max-h-[200px] resize-none text-xs bg-muted/40 border-border focus-visible:ring-primary/30 py-2.5 pr-10 overflow-y-auto transition-[height] duration-200"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      />
                      <button
                        onClick={handleRefine}
                        disabled={!input.trim() || isRefining}
                        className={cn(
                          "absolute right-2 top-2.5 p-1 rounded-md transition-all",
                          isRefining ? "animate-pulse text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        )}
                        title="Refine with AI (✨)"
                      >
                        <Sparkles className={cn("w-4 h-4", isRefining && "animate-spin-slow")} />
                      </button>
                    </div>
                    <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon" className="gradient-primary text-primary-foreground self-end h-10 w-10 shrink-0 shadow-sm hover:brightness-110">
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
