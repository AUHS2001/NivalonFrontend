import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface FooterActionProps {
  children: React.ReactNode;
  className?: string;
}

interface ActionProps extends FooterActionProps {
  onClick: () => void;
  className?: string;
}

type FooterActionComponent = React.FC<FooterActionProps> & {
  Left: React.FC<FooterActionProps>;
  Right: React.FC<FooterActionProps>;
  Primary: React.FC<ActionProps>;
  Secondary: React.FC<ActionProps>;
  Auxiliary: React.FC<ActionProps>;
};

export const FooterAction: FooterActionComponent = ({ children, className }: FooterActionProps) => {
  // Convert children to array for easier inspection
  const arrayChildren = React.Children.toArray(children);

  // Check if we have a <FooterAction.Left> or <FooterAction.Right> among children
  const hasLeft = arrayChildren.some(
    (child: any) => child.type?.displayName === 'FooterAction.Left'
  );
  const hasRight = arrayChildren.some(
    (child: any) => child.type?.displayName === 'FooterAction.Right'
  );

  // Decide on the justification class based on presence of Left/Right
  let justifyClass = 'justify-between'; // default
  if (hasLeft && !hasRight) {
    justifyClass = 'justify-start';
  } else if (!hasLeft && hasRight) {
    justifyClass = 'justify-end';
  }
  // If both or neither are present, keep justify-between (or adjust if you like)
  return (
    <div
      className={cn('flex w-full flex-shrink-0 items-center pt-4', justifyClass, className)}
      style={{ borderTop: '1px solid rgba(52,140,253,0.18)' }}
    >
      {children}
    </div>
  );
};

FooterAction.displayName = 'FooterAction';

FooterAction.Left = ({ children }: FooterActionProps) => {
  return <div className="flex items-center">{children}</div>;
};
FooterAction.Left.displayName = 'FooterAction.Left';

FooterAction.Right = ({ children }: FooterActionProps) => {
  return <div className="flex items-center space-x-2">{children}</div>;
};
FooterAction.Right.displayName = 'FooterAction.Right';

// Primary action: blue glass button
FooterAction.Primary = ({ children, onClick, className }: ActionProps) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('min-w-[88px] rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 focus:outline-none', className)}
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #1a7aff, #0A6FFD)'
          : 'linear-gradient(135deg, #0A6FFD, #0857d4)',
        color: '#ffffff',
        border: '1px solid rgba(10,111,253,0.6)',
        boxShadow: hovered
          ? '0 0 20px rgba(10,111,253,0.45), 0 4px 12px rgba(0,0,0,0.4)'
          : '0 0 10px rgba(10,111,253,0.2), 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {children}
    </button>
  );
};
FooterAction.Primary.displayName = 'FooterAction.Primary';

// Secondary action: ghost glass button
FooterAction.Secondary = ({ children, onClick, className }: ActionProps) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('min-w-[88px] rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 focus:outline-none', className)}
      style={{
        backgroundColor: hovered ? 'rgba(52,140,253,0.1)' : 'rgba(14,20,42,0.5)',
        color: 'rgba(180,210,255,0.9)',
        border: '1px solid rgba(52,140,253,0.2)',
      }}
    >
      {children}
    </button>
  );
};
FooterAction.Secondary.displayName = 'FooterAction.Secondary';

// Auxiliary action: text-style button
FooterAction.Auxiliary = ({ children, onClick, className }: ActionProps) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('rounded-lg px-3 py-2 text-sm transition-all duration-150 focus:outline-none', className)}
      style={{
        color: hovered ? 'rgba(130,185,255,1)' : 'rgba(130,185,255,0.6)',
        backgroundColor: hovered ? 'rgba(52,140,253,0.08)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
};
FooterAction.Auxiliary.displayName = 'FooterAction.Auxiliary';
