import * as React from 'react';
import { Label } from '../Label';
import { Input } from '../Input';
import { cn } from '../../lib/utils';

interface UserPreferencesModalProps {
  children: React.ReactNode;
  className?: string;
}

export function UserPreferencesModal({ children, className }: UserPreferencesModalProps) {
  return (
    <div className={cn('flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden gap-5', className)}>
      {children}
    </div>
  );
}

/** Body - scrollable content area */
interface BodyProps {
  children: React.ReactNode;
  className?: string;
}
function Body({ children, className }: BodyProps) {
  return (
    <div
      className={cn('flex-1 overflow-y-auto', className)}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(52,140,253,0.35) transparent',
        paddingRight: '4px',
      }}
    >
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

/** Subheading - section label with accent bar */
interface SubHeadingProps {
  children: React.ReactNode;
  className?: string;
}
function SubHeading({ children, className }: SubHeadingProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        style={{
          height: '1px',
          flex: 1,
          background: 'linear-gradient(to right, rgba(10,111,253,0.55), transparent)',
        }}
      />
      <div className="flex items-center gap-2">
        <div
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: '#0A6FFD',
            boxShadow: '0 0 6px rgba(10,111,253,0.8)',
          }}
        />
        <span
          style={{
            color: 'rgba(130,185,255,0.95)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {children}
        </span>
        <div
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: '#0A6FFD',
            boxShadow: '0 0 6px rgba(10,111,253,0.8)',
          }}
        />
      </div>
      <div
        style={{
          height: '1px',
          flex: 1,
          background: 'linear-gradient(to left, rgba(10,111,253,0.55), transparent)',
        }}
      />
    </div>
  );
}

/** Responsive 3-column grid for hotkeys */
interface HotkeysGridProps {
  children: React.ReactNode;
  className?: string;
}
function HotkeysGrid({ children, className }: HotkeysGridProps) {
  return (
    <div
      className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3', className)}
      style={{ gap: '6px' }}
    >
      {children}
    </div>
  );
}

/** A single hotkey row: label + input */
interface HotkeyProps {
  label: string;
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  hotkeys?: {
    record: (callback: (sequence: string[]) => void) => void;
    pause: () => void;
    unpause: () => void;
    startRecording: () => void;
  };
}

function Hotkey({ label, placeholder, className, value, onChange, hotkeys }: HotkeyProps) {
  const [isRecording, setIsRecording] = React.useState(false);

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault();
    hotkeys?.record((sequence: string[]) => {
      const keys = sequence.join('+');
      hotkeys?.unpause();
      setIsRecording(false);
      onChange?.(keys);
    });
  };

  const onFocus = () => {
    setIsRecording(true);
    hotkeys?.pause();
    hotkeys?.startRecording();
  };

  const onBlur = () => {
    setIsRecording(false);
    hotkeys?.unpause();
  };

  return (
    <div
      className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-all duration-150', className)}
      style={{
        backgroundColor: isRecording ? 'rgba(10,111,253,0.08)' : 'rgba(10,15,35,0.55)',
        border: isRecording
          ? '1px solid rgba(10,111,253,0.55)'
          : '1px solid rgba(52,140,253,0.1)',
        boxShadow: isRecording ? '0 0 14px rgba(10,111,253,0.12)' : 'none',
      }}
    >
      <Label
        className="whitespace-nowrap truncate text-xs"
        style={{ color: 'rgba(180,205,245,0.8)', maxWidth: '65%' }}
      >
        {label}
      </Label>
      <Input
        className="w-20 shrink-0 text-center text-xs border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{
          backgroundColor: isRecording ? 'rgba(10,111,253,0.18)' : 'rgba(14,20,42,0.8)',
          color: isRecording ? '#ffffff' : 'rgba(200,220,255,0.9)',
          border: `1px solid ${isRecording ? 'rgba(10,111,253,0.7)' : 'rgba(52,140,253,0.2)'}`,
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
        placeholder={isRecording ? 'Press keys...' : placeholder}
        value={value}
        onKeyDown={onInputKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        readOnly={!isRecording}
      />
    </div>
  );
}

/** Attach subcomponents */
UserPreferencesModal.Body = Body;
UserPreferencesModal.HotkeysGrid = HotkeysGrid;
UserPreferencesModal.Hotkey = Hotkey;
UserPreferencesModal.SubHeading = SubHeading;
