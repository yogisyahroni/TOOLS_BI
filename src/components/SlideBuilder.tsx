import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Image as ImageIcon, Copy, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { StoryEditor } from './StoryEditor';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export interface Slide {
  id: string;
  title: string;
  content: string;
}

interface SlideBuilderProps {
  slides: Slide[];
  onChange: (slides: Slide[]) => void;
}

export function SlideBuilder({ slides, onChange }: SlideBuilderProps) {
  const [activeSlideId, setActiveSlideId] = useState<string>(slides[0]?.id || '');

  const activeIndex = slides.findIndex(s => s.id === activeSlideId);
  const activeSlide = slides[activeIndex];

  const handleAddSlide = () => {
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      title: `Slide ${slides.length + 1}`,
      content: ''
    };
    onChange([...slides, newSlide]);
    setActiveSlideId(newSlide.id);
  };

  const handleDuplicateSlide = (e: React.MouseEvent, slide: Slide) => {
    e.stopPropagation();
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      title: `${slide.title} (Copy)`,
      content: slide.content
    };
    const index = slides.findIndex(s => s.id === slide.id);
    const newSlides = [...slides];
    newSlides.splice(index + 1, 0, newSlide);
    onChange(newSlides);
    setActiveSlideId(newSlide.id);
  };

  const handleDeleteSlide = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (slides.length <= 1) return; // Must have at least one slide

    const newSlides = slides.filter(s => s.id !== id);
    onChange(newSlides);
    if (activeSlideId === id) {
      setActiveSlideId(newSlides[Math.max(0, activeIndex - 1)]?.id || '');
    }
  };

  const handleUpdateSlideContent = (content: string) => {
    if (!activeSlideId) return;
    const newSlides = slides.map(s => s.id === activeSlideId ? { ...s, content } : s);
    onChange(newSlides);
  };

  const handleUpdateSlideTitle = (title: string) => {
    if (!activeSlideId) return;
    const newSlides = slides.map(s => s.id === activeSlideId ? { ...s, title } : s);
    onChange(newSlides);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(slides);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onChange(items);
  };

  const goPrev = () => {
    if (activeIndex > 0) setActiveSlideId(slides[activeIndex - 1].id);
  };

  const goNext = () => {
    if (activeIndex < slides.length - 1) setActiveSlideId(slides[activeIndex + 1].id);
  };

  return (
    <div className="flex h-full w-full bg-background border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Sidebar - Slides List */}
      <div className="w-64 border-r border-border flex flex-col bg-muted/10">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
          <h3 className="font-semibold text-sm text-foreground">Slides ({slides.length})</h3>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={handleAddSlide}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="slides-list">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="p-3 space-y-2">
                  {slides.map((slide, index) => (
                    <Draggable key={slide.id} draggableId={slide.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
                            activeSlideId === slide.id
                              ? 'bg-primary/5 border-primary shadow-sm text-primary'
                              : 'bg-card border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                          } ${snapshot.isDragging ? 'shadow-md opacity-80' : ''}`}
                          onClick={() => setActiveSlideId(slide.id)}
                        >
                          <div {...provided.dragHandleProps} className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate mb-1">
                              {index + 1}. {slide.title || 'Untitled Slide'}
                            </div>
                            <div className="text-[10px] truncate opacity-70">
                              {slide.content ? slide.content.replace(/<[^>]+>/g, '').substring(0, 30) + '...' : 'Empty slide'}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-5 w-5 hover:bg-black/5 dark:hover:bg-white/10" 
                              onClick={(e) => handleDuplicateSlide(e, slide)}
                              title="Duplicate slide"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            {slides.length > 1 && (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-5 w-5 text-destructive hover:bg-destructive/10" 
                                onClick={(e) => handleDeleteSlide(e, slide.id)}
                                title="Delete slide"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </ScrollArea>
      </div>

      {/* Main Area - Editor */}
      <div className="flex-1 flex flex-col bg-muted/5 w-full min-w-0">
        {activeSlide ? (
          <>
            {/* Topbar of Editor */}
            <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
              <div className="flex-1 max-w-md">
                <Input
                  value={activeSlide.title}
                  onChange={(e) => handleUpdateSlideTitle(e.target.value)}
                  className="font-medium bg-transparent border-transparent hover:border-input focus-visible:ring-1"
                  placeholder="Slide Title..."
                />
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={goPrev} 
                  disabled={activeIndex === 0}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span>{activeIndex + 1} / {slides.length}</span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={goNext} 
                  disabled={activeIndex === slides.length - 1}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Editor Focus Area */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
              <div className="w-full mx-auto bg-card rounded-xl border border-border shadow-sm overflow-hidden h-full flex flex-col min-h-[500px]">
                <StoryEditor content={activeSlide.content} onChange={handleUpdateSlideContent} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
            <ImageIcon className="h-12 w-12 opacity-20" />
            <p>Select or create a slide to start editing</p>
          </div>
        )}
      </div>
    </div>
  );
}
