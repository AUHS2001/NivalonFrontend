import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '../../lib/utils';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track
      className="relative w-full grow rounded-full"
      style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.15)' }}
    >
      <SliderPrimitive.Range
        className="absolute h-full rounded-full"
        style={{ backgroundColor: 'rgba(52,140,253,0.85)' }}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      style={{
        display: 'block',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        border: '2px solid rgba(52,140,253,0.9)',
        cursor: 'pointer',
        boxShadow: '0 0 0 3px rgba(52,140,253,0.15)',
        transition: 'box-shadow 0.15s',
      }}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
