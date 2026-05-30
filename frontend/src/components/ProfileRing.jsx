/**
 * ProfileRing
 * ─────────────────────────────────────────────────────────────────────────────
 * SVG circular progress ring that wraps an avatar (initials or image).
 *
 * Props
 * ─────
 *   size        {number}  – outer diameter in px          default 36
 *   pct         {number}  – completion 0–100              required
 *   ringColor   {string}  – stroke color                  default '#2D8A60'
 *   trackColor  {string}  – empty track color             default '#E8ECF0'
 *   strokeWidth {number}  – ring thickness in px          default 2.5
 *   children    {node}    – avatar content (img or div)   required
 *
 * The ring animates on mount via CSS transition on stroke-dashoffset.
 */

import React from 'react';

export default function ProfileRing({
  size        = 36,
  pct         = 0,
  ringColor   = '#2D8A60',
  trackColor  = '#E8ECF0',
  strokeWidth = 2.5,
  children,
}) {
  const radius          = (size - strokeWidth) / 2;
  const circumference   = 2 * Math.PI * radius;
  const filledDash      = (pct / 100) * circumference;
  const gapDash         = circumference - filledDash;
  // Small gap (3px) between segments for a cleaner look; skip if nearly full
  const dashArray       = pct >= 99
    ? `${circumference} 0`
    : `${Math.max(0, filledDash - 2)} ${gapDash + 2}`;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Background track + filled arc */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>

      {/* Avatar content — centered inside the ring */}
      <div
        className="absolute rounded-full overflow-hidden"
        style={{
          inset: strokeWidth + 1,   // slight inset so avatar doesn't touch ring
        }}
      >
        {children}
      </div>
    </div>
  );
}
