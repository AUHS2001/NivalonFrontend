import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';

import { cn } from '../../lib/utils';
import { useDraggable } from './useDraggable';

interface DialogContextValue {
  isDraggable?: boolean;
  shouldCloseOnEsc?: boolean;
  shouldCloseOnOverlayClick?: boolean;
  showOverlay?: boolean;
}

const DialogContext = React.createContext<DialogContextValue>({
  isDraggable: false,
  shouldCloseOnEsc: true,
  shouldCloseOnOverlayClick: true,
});

interface DialogRootProps extends DialogPrimitive.DialogProps {
  isDraggable?: boolean;
  shouldCloseOnEsc?: boolean;
  shouldCloseOnOverlayClick?: boolean;
  showOverlay?: boolean;
}

const Dialog = ({
  isDraggable,
  shouldCloseOnEsc = true,
  shouldCloseOnOverlayClick = true,
  showOverlay = true,
  ...props
}: DialogRootProps) => (
  <DialogContext.Provider
    value={{ isDraggable, shouldCloseOnEsc, shouldCloseOnOverlayClick, showOverlay }}
  >
    <DialogPrimitive.Root {...props} />
  </DialogContext.Provider>
);

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/60',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  unstyled?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps & {
    children?: React.ReactNode;
  }
>(({ className, children, unstyled, ...props }, ref) => {
  const { isDraggable, shouldCloseOnEsc, shouldCloseOnOverlayClick, showOverlay } =
    React.useContext(DialogContext);

  const { handlePointerDown, setRefs, initialTransform } = useDraggable(
    {
      enabled: isDraggable,
    },
    ref
  );

  // When not isDraggable, Tailwind centers the dialog.
  // When isDraggable, we remove the built‑in centering so our inline transform takes over.
  const contentClassName = cn(
    unstyled ? '' : 'w-full',
    'max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-[50%] top-[50%] z-50 grid gap-4 p-5 duration-200 sm:rounded-2xl',
    !isDraggable ? 'translate-x-[-50%] translate-y-[-50%]' : '',
    className
  );

  const glassStyle = unstyled ? props.style : {
    backgroundColor: 'rgba(6, 9, 20, 0.97)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(52, 140, 253, 0.22)',
    boxShadow: '0 0 60px rgba(10,111,253,0.12), 0 24px 80px rgba(0,0,0,0.85)',
    ...props.style,
  };

  const style = isDraggable ? { ...glassStyle, transform: initialTransform } : glassStyle;

  const content = (
    <DialogPrimitive.Content
      ref={setRefs}
      className={contentClassName}
      {...props}
      style={style}
      onPointerDown={isDraggable ? handlePointerDown : props.onPointerDown}
      onEscapeKeyDown={event => {
        if (!shouldCloseOnEsc) {
          event.preventDefault();
        }
      }}
      onInteractOutside={event => {
        if (!shouldCloseOnOverlayClick) {
          event.preventDefault();
        }
      }}
    >
      {children}
      {!unstyled && (
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
          <Cross2Icon className="text-primary h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  );

  return (
    <DialogPortal>
      {showOverlay && !isDraggable && <DialogOverlay />}
      {content}
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'drag-handle relative flex select-none flex-col space-y-1.5 text-center sm:text-left',
        'pb-4 border-b border-[rgba(52,140,253,0.18)]',
        className
      )}
      {...props}
    >
      {props.children}
    </div>
  );
};
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-xl font-semibold leading-none tracking-tight', className)}
    style={{ background: 'linear-gradient(135deg, #ffffff 30%, rgba(130,185,255,0.9) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    className?: string;
  }
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-base', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
