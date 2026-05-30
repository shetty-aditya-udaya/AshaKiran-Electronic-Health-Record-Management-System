import React from 'react';

const riskStyles = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-red-100 text-red-700 border-red-200',
};

export default function RiskBadge({ level }) {
  const levelLower = (level || 'low').toLowerCase();
  
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${riskStyles[levelLower] || riskStyles.low}`}>
      {levelLower}
    </span>
  );
}
