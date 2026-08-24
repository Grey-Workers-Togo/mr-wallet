'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function ChartTooltip({
  visible,
  xPct,
  yPct,
  children,
}: {
  visible: boolean;
  xPct: number;
  yPct: number;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141418] px-2.5 py-1.5 text-xs whitespace-nowrap text-neutral-800 dark:text-neutral-200 shadow-lg"
          style={{ left: `${xPct}%`, top: `${yPct}%`, marginTop: -8 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LineChart({
  months,
  seriesA,
  seriesB,
  colorA,
  colorB,
  labelA,
  labelB,
  unit,
}: {
  months: string[];
  seriesA: number[];
  seriesB?: number[];
  colorA: string;
  colorB?: string;
  labelA: string;
  labelB?: string;
  unit: string;
}) {
  const width = 560;
  const height = 200;
  const padding = 28;
  const all = seriesB ? [...seriesA, ...seriesB] : seriesA;
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const [hover, setHover] = useState<number | null>(null);

  const toPoint = (values: number[], index: number): [number, number] => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (((values[index] ?? 0) - min) / range) * (height - padding * 2);
    return [x, y];
  };

  const toPath = (values: number[]) => values.map((_, i) => toPoint(values, i).join(',')).join(' ');
  const bandWidth = (width - padding * 2) / Math.max(months.length - 1, 1);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" className="text-neutral-200" />
        {hover !== null && (
          <line
            x1={toPoint(seriesA, hover)[0]}
            y1={padding * 0.3}
            x2={toPoint(seriesA, hover)[0]}
            y2={height - padding}
            stroke="currentColor"
            strokeDasharray="3 3"
            className="text-neutral-300"
          />
        )}
        <motion.polyline
          points={toPath(seriesA)}
          fill="none"
          stroke={colorA}
          strokeWidth={2}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {seriesB && (
          <motion.polyline
            points={toPath(seriesB)}
            fill="none"
            stroke={colorB}
            strokeWidth={2}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          />
        )}
        {seriesA.map((_, i) => {
          const [x, y] = toPoint(seriesA, i);
          return <motion.circle key={`a-${i}`} cx={x} cy={y} r={hover === i ? 5 : 3} fill={colorA} animate={{ r: hover === i ? 5 : 3 }} />;
        })}
        {seriesB?.map((_, i) => {
          const [x, y] = toPoint(seriesB, i);
          return <motion.circle key={`b-${i}`} cx={x} cy={y} r={hover === i ? 5 : 3} fill={colorB} animate={{ r: hover === i ? 5 : 3 }} />;
        })}
        {months.map((label, i) => {
          const [x] = toPoint(seriesA, i);
          return (
            <text key={label} x={x} y={height - 6} textAnchor="middle" fontSize={10} className="fill-neutral-500">
              {label}
            </text>
          );
        })}
        {months.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={padding + i * bandWidth - bandWidth / 2}
            y={0}
            width={bandWidth}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (
        <ChartTooltip
          visible
          xPct={(toPoint(seriesA, hover)[0] / width) * 100}
          yPct={(Math.min(toPoint(seriesA, hover)[1], seriesB ? toPoint(seriesB, hover)[1] : Infinity) / height) * 100}
        >
          <div className="font-medium">{months[hover]}</div>
          <div className="flex items-center gap-1.5" style={{ color: colorA }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: colorA }} />
            {labelA}: {seriesA[hover]?.toLocaleString('fr-FR')} {unit}
          </div>
          {seriesB && (
            <div className="flex items-center gap-1.5" style={{ color: colorB }}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: colorB }} />
              {labelB}: {seriesB[hover]?.toLocaleString('fr-FR')} {unit}
            </div>
          )}
        </ChartTooltip>
      )}
    </div>
  );
}
