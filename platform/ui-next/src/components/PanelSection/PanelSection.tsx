import React from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../Accordion/Accordion';
import { cn } from '../../lib/utils';
import { Icons } from '../Icons/Icons';

interface PanelSectionProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

interface PanelSectionHeaderProps {
  children: React.ReactNode;
  className?: string;
  showChevron?: boolean;
}

interface PanelSectionContentProps {
  children: React.ReactNode;
  className?: string;
}

export const PanelSection: React.FC<PanelSectionProps> & {
  Header: React.FC<PanelSectionHeaderProps>;
  Content: React.FC<PanelSectionContentProps>;
} = ({ children, defaultOpen = true, className }) => {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? 'item' : undefined}
      className={cn('flex-shrink-0 overflow-hidden', className)}
    >
      <AccordionItem
        value="item"
        className="border-none"
      >
        {children}
      </AccordionItem>
    </Accordion>
  );
};

PanelSection.Header = ({ children, className }) => (
  <AccordionTrigger
    className={cn(
      'bg-gradient-to-r from-[rgba(14,20,42,0.95)] to-[rgba(8,12,24,0.9)]',
      'hover:from-[rgba(18,26,54,0.98)] hover:to-[rgba(12,17,36,0.95)]',
      'border-b border-[rgba(52,140,253,0.13)] hover:border-[rgba(52,140,253,0.28)]',
      'hover:shadow-[0_2px_12px_rgba(52,140,253,0.08),inset_0_1px_0_rgba(255,255,255,0.04)]',
      'text-[rgba(130,185,255,0.9)] hover:text-[rgba(150,200,255,1)]',
      'my-[2px] flex h-8 w-full items-center justify-between rounded-sm py-2 pr-2 pl-3 text-[13px]',
      'transition-all duration-200',
      className
    )}
  >
    {children}
  </AccordionTrigger>
);

PanelSection.Header.displayName = 'PanelSection.Header';

PanelSection.Content = ({ children, className }) => (
  <AccordionContent className={cn('overflow-hidden p-0', className)}>
    <div className="rounded-b">{children}</div>
  </AccordionContent>
);

PanelSection.Content.displayName = 'PanelSection.Content';
