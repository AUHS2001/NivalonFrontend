import React from 'react';
import type { IconProps } from '../types';

export const SidePanelCloseRight = (props: IconProps) => (
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
      d="M11 6L17 12L11 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Secondary chevron (faded, creates depth) */}
    <path
      d="M6 6L12 12L6 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.4"
    />
  </svg>
);

export default SidePanelCloseRight;
