import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface HelpTooltipProps {
  text: string;
  className?: string;
}

export function HelpTooltip({ text, className }: HelpTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className={`inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors p-0.5 ${className || ''}`}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[280px] text-xs leading-relaxed">
        <p className="text-popover-foreground">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
