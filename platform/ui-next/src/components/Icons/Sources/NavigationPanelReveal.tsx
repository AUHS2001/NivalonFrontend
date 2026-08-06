import React from 'react';
import type { IconProps } from '../types';

// Points left by default (right panel collapsed → click to reveal).
// Rotated 180° when used for the collapsed left panel → points right.
export const NavigationPanelReveal = (props: IconProps) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {/* Primary chevron */}
    <path
      d="M13 6L7 12L13 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Secondary chevron (faded) */}
    <path
      d="M18 6L12 12L18 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.4"
    />
  </svg>
);

export default NavigationPanelReveal;
