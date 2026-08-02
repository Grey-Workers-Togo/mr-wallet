'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, TrendingDown, PiggyBank, Gauge, Flame } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrencies } from '@/hooks/useCurrencies';
import { PageLoader } from '@/components/shared/PageLoader';

interface MonthlyPoint {
  month: string;
  incomeMinor: string;
  expenseMinor: string;
  netMinor: string;
}

interface CategorySpendItem {
  categoryId: string | null;
  totalMinor: string;
  pct: number;
}

interface Category {
  id: string;
  name: string | null;
  i18nKey: string | null;
}

interface BudgetVsActual {
  budgetId: string;
  budgetName: string;
  allocatedMinor: string;
  spentMinor: string;
}

interface Transaction {
  occurredAt: string;
  transferGroupId: string | null;
}

interface Streak {
  current: number;
  longest: number;
}

const DONUT_COLORS = ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#7dd3fc'];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function formatMinor(amountMinor: string | bigint, currency: string, minorUnits: number) {
  const value = Number(amountMinor) / 10 ** minorUnits;
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: minorUnits > 0 ? minorUnits : 0,
    maximumFractionDigits: minorUnits > 0 ? minorUnits : 0,
  }).format(value);
  return `${formatted} ${currency}`;
}

function compactMinor(amountMinor: bigint, minorUnits: number) {
  const value = Number(amountMinor) / 10 ** minorUnits;
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function ChartTooltip({
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap text-neutral-800 shadow-lg"
          style={{ left: `${xPct}%`, top: `${yPct}%`, marginTop: -8 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LineChart({
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

  const toPath = (values: number[]) => values.map((_, i) => toPoint(values, i).join(',')).join(' L ');
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

function AreaChart({ months, values, color, label, unit }: { months: string[]; values: number[]; color: string; label: string; unit: string }) {
  const width = 560;
  const height = 200;
  const padding = 28;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const [hover, setHover] = useState<number | null>(null);

  const toPoint = (index: number): [number, number] => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (((values[index] ?? 0) - min) / range) * (height - padding * 2);
    return [x, y];
  };
  const zeroY = height - padding - ((0 - min) / range) * (height - padding * 2);
  const linePoints = values.map((_, i) => toPoint(i).join(',')).join(' L ');
  const areaPoints = `${padding},${zeroY} L ${linePoints} L ${width - padding},${zeroY} Z`;
  const bandWidth = (width - padding * 2) / Math.max(months.length - 1, 1);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="currentColor" className="text-neutral-200" />
        {hover !== null && (
          <line x1={toPoint(hover)[0]} y1={padding * 0.3} x2={toPoint(hover)[0]} y2={height - padding} stroke="currentColor" strokeDasharray="3 3" className="text-neutral-300" />
        )}
        <motion.path
          d={`M ${areaPoints}`}
          fill={color}
          fillOpacity={0.15}
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
        <motion.polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {values.map((_, i) => {
          const [x, y] = toPoint(i);
          return <motion.circle key={i} cx={x} cy={y} r={hover === i ? 5 : 3} fill={color} animate={{ r: hover === i ? 5 : 3 }} />;
        })}
        {months.map((label2, i) => {
          const [x] = toPoint(i);
          return (
            <text key={label2} x={x} y={height - 6} textAnchor="middle" fontSize={10} className="fill-neutral-500">
              {label2}
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
        <ChartTooltip visible xPct={(toPoint(hover)[0] / width) * 100} yPct={(toPoint(hover)[1] / height) * 100}>
          <div className="font-medium">{months[hover]}</div>
          <div className="flex items-center gap-1.5" style={{ color }}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}: {values[hover]?.toLocaleString('fr-FR')} {unit}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

function Donut({ items, unit }: { items: { label: string; value: number; color: string }[]; unit: string }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (total <= 0) return null;
  const size = 200;
  const strokeWidth = 34;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((item) => {
    const fraction = item.value / total;
    const dash = fraction * circumference;
    const segment = { ...item, dash, offset, fraction };
    offset += dash;
    return segment;
  });

  return (
    <div className="relative mx-auto h-52 w-52">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-52 w-52" role="img">
        {segments.map((segment, i) => (
          <motion.circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={hover === i ? strokeWidth + 6 : strokeWidth}
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            initial={{ strokeDashoffset: -segment.offset - segment.dash, strokeDasharray: `0 ${circumference}` }}
            animate={{
              strokeDashoffset: -segment.offset,
              strokeDasharray: `${segment.dash} ${circumference - segment.dash}`,
              strokeWidth: hover === i ? strokeWidth + 6 : strokeWidth,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </svg>
      {hover !== null && segments[hover] && (
        <ChartTooltip visible xPct={50} yPct={50}>
          <div className="font-medium">{segments[hover].label}</div>
          <div>
            {segments[hover].value.toLocaleString('fr-FR')} {unit} · {Math.round(segments[hover].fraction * 100)}%
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

function BarChart({ labels, values, color, unit }: { labels: string[]; values: number[]; color: string; unit: string }) {
  const width = 560;
  const height = 200;
  const padding = 28;
  const max = Math.max(...values, 1);
  const barWidth = (width - padding * 2) / values.length;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = height - padding - fraction * (height - padding * 2);
          return <line key={fraction} x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" className="text-neutral-100" />;
        })}
        {values.map((value, i) => {
          const barHeight = (value / max) * (height - padding * 2);
          const x = padding + i * barWidth + barWidth * 0.2;
          const y = height - padding - barHeight;
          return (
            <motion.rect
              key={labels[i]}
              x={x}
              width={barWidth * 0.6}
              fill={hover === i ? color : color}
              opacity={hover === i ? 1 : 0.85}
              rx={2}
              initial={{ height: 0, y: height - padding }}
              animate={{ height: barHeight, y }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.03 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
        {labels.map((label, i) => {
          const x = padding + i * barWidth + barWidth / 2;
          return (
            <text key={label} x={x} y={height - 6} textAnchor="middle" fontSize={10} className="fill-neutral-500">
              {label}
            </text>
          );
        })}
      </svg>
      {hover !== null && (
        <ChartTooltip
          visible
          xPct={((padding + hover * barWidth + barWidth / 2) / width) * 100}
          yPct={((height - padding - (values[hover]! / max) * (height - padding * 2)) / height) * 100}
        >
          <div className="font-medium">{labels[hover]}</div>
          <div>
            {values[hover]} {unit}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');
  const locale = useLocale();

  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [months, setMonths] = useState<MonthlyPoint[] | null>(null);
  const [categorySpend, setCategorySpend] = useState<{ currency: string; totalMinor: string; items: CategorySpendItem[] } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetVsActual[] | null>(null);
  const [weekdayCounts, setWeekdayCounts] = useState<number[]>(new Array(7).fill(0));
  const [streak, setStreak] = useState<Streak | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    Promise.all([
      apiClient.get<{ currency: string; months: MonthlyPoint[] }>('/reports/monthly-summary?months=6'),
      apiClient.get<{ currency: string; totalMinor: string; items: CategorySpendItem[] }>(
        `/reports/spending-by-category?from=${monthStart}&to=${todayStr}`,
      ),
      apiClient.get<Category[]>('/categories'),
      apiClient.get<BudgetVsActual[]>('/reports/budget-vs-actual'),
      apiClient.get<{ items: Transaction[] }>(`/transactions?from=${monthStart}&to=${todayStr}&limit=200`),
      apiClient.get<{ streak: Streak }>('/reports/dashboard'),
    ])
      .then(([monthly, spend, categoryList, budgetList, txPage, dashboard]) => {
        setMonths(monthly.months);
        setCategorySpend(spend);
        setCategories(categoryList);
        setBudgets(budgetList);
        setStreak(dashboard.streak);
        const counts = new Array(7).fill(0);
        for (const tx of txPage.items) {
          if (tx.transferGroupId) continue;
          const day = (new Date(tx.occurredAt).getDay() + 6) % 7; // Monday = 0
          counts[day] += 1;
        }
        setWeekdayCounts(counts);
      })
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function resolveCategoryName(categoryId: string | null): string {
    if (!categoryId) return t('uncategorized');
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return t('uncategorized');
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return t('uncategorized');
  }

  const currency = categorySpend?.currency ?? 'XOF';
  const minorUnits = minorUnitsByCode[currency] ?? 0;

  const currentMonth = months?.[months.length - 1] ?? null;
  const totalIncomeMinor = currentMonth ? BigInt(currentMonth.incomeMinor) : 0n;
  const totalExpenseMinor = currentMonth ? BigInt(currentMonth.expenseMinor) : 0n;
  const netSavingsMinor = totalIncomeMinor - totalExpenseMinor;
  const dayOfMonth = new Date().getDate();
  const avgDailySpendMinor = dayOfMonth > 0 ? totalExpenseMinor / BigInt(dayOfMonth) : 0n;

  const monthLabels = useMemo(
    () => (months ?? []).map((m) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${m.month}-01T00:00:00Z`))),
    [months, locale],
  );
  const incomeValues = (months ?? []).map((m) => Number(m.incomeMinor) / 10 ** minorUnits);
  const expenseValues = (months ?? []).map((m) => Number(m.expenseMinor) / 10 ** minorUnits);
  const netValues = (months ?? []).map((m) => Number(m.netMinor) / 10 ** minorUnits);

  const weekdayLabels = useMemo(() => {
    const base = new Date(Date.UTC(2024, 0, 1)); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
    });
  }, [locale]);

  const donutItems = (categorySpend?.items ?? [])
    .filter((item) => BigInt(item.totalMinor) > 0n)
    .sort((a, b) => Number(BigInt(b.totalMinor) - BigInt(a.totalMinor)))
    .map((item, i) => ({
      label: resolveCategoryName(item.categoryId),
      value: Number(item.totalMinor),
      color: DONUT_COLORS[i % DONUT_COLORS.length] ?? '#38bdf8',
    }));

  const topCategory = donutItems[0];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
        <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
      </motion.div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {months === null && !error && <PageLoader />}

      {months && (
      <>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Banknote className="size-4 text-emerald-600" />
              {t('totalIncome')}
            </div>
            <p className="mt-2 text-xl font-semibold text-emerald-600">{formatMinor(totalIncomeMinor, currency, minorUnits)}</p>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Banknote className="size-4 text-red-600" />
              {t('totalExpense')}
            </div>
            <p className="mt-2 text-xl font-semibold text-red-600">{formatMinor(totalExpenseMinor, currency, minorUnits)}</p>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <PiggyBank className="size-4 text-amber-600" />
              {t('netSavings')}
            </div>
            <p className={`mt-2 text-xl font-semibold ${netSavingsMinor < 0n ? 'text-red-600' : 'text-emerald-600'}`}>
              {formatMinor(netSavingsMinor, currency, minorUnits)}
            </p>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Gauge className="size-4 text-blue-600" />
              {t('avgDailySpend')}
            </div>
            <p className="mt-2 text-xl font-semibold text-neutral-900">{formatMinor(avgDailySpendMinor, currency, minorUnits)}</p>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Flame className="size-4 text-orange-600" />
              {t('streakTitle')}
            </div>
            <p className="mt-2 text-xl font-semibold text-neutral-900">{t('streakCurrent', { days: streak?.current ?? 0 })}</p>
            <p className="mt-1 text-xs text-neutral-500">{t('streakLongest', { days: streak?.longest ?? 0 })}</p>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="p-5">
          <h2 className="text-lg font-medium text-neutral-900">{t('recommendationsTitle')}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t('recommendationsSubtitle')}</p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-neutral-800">
            {topCategory ? (
              <span className="flex items-center gap-2">
                <TrendingDown className="size-4 text-amber-600" />
                {t('recommendationCategoryPct', {
                  category: topCategory.label,
                  pct: Math.round((topCategory.value / (categorySpend ? Number(categorySpend.totalMinor) : 1)) * 100),
                })}
              </span>
            ) : (
              t('noRecommendation')
            )}
          </div>
        </Card>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <h2 className="text-lg font-medium text-neutral-900">{t('incomeVsExpenseTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t('incomeVsExpenseSubtitle', { months: monthLabels.length })}</p>
            <div className="mt-4">
              <LineChart
                months={monthLabels}
                seriesA={incomeValues}
                seriesB={expenseValues}
                colorA="#7dd3fc"
                colorB="#0c4a6e"
                labelA={t('incomeLabel')}
                labelB={t('expenseLabel')}
                unit={currency}
              />
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-neutral-600">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-300" />{t('incomeLabel')}</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-900" />{t('expenseLabel')}</span>
              </div>
              <p className="mt-1 text-center text-xs text-neutral-400">{t('clickToSeeTransactions')}</p>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <h2 className="text-lg font-medium text-neutral-900">{t('savingsTrendTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t('savingsTrendSubtitle')}</p>
            <div className="mt-4">
              <AreaChart months={monthLabels} values={netValues} color="#0ea5e9" label={t('netSavings')} unit={currency} />
              <p className="mt-1 text-center text-xs text-neutral-400">{t('clickToSeeTransactions')}</p>
            </div>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <h2 className="text-lg font-medium text-neutral-900">{t('categoryBreakdownTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t('categoryBreakdownSubtitle')}</p>
            {donutItems.length === 0 ? (
              <p className="mt-8 text-center text-sm text-neutral-500">{t('categoryBreakdownEmpty')}</p>
            ) : (
              <>
                <div className="mt-4">
                  <Donut items={donutItems} unit={currency} />
                </div>
                <p className="mt-2 text-center text-xs text-neutral-400">{t('clickToSeeTransactions')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {donutItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-neutral-600">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <span className="font-medium text-neutral-900">{compactMinor(BigInt(Math.round(item.value)), minorUnits)} {currency}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </motion.div>
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
          <Card className="p-5">
            <h2 className="text-lg font-medium text-neutral-900">{t('transactionFrequencyTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t('transactionFrequencySubtitle')}</p>
            <div className="mt-4">
              <BarChart labels={weekdayLabels} values={weekdayCounts} color="#38bdf8" unit={t('transactionsUnit')} />
            </div>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="p-5">
          <h2 className="text-lg font-medium text-neutral-900">{t('budgetUsageTitle')}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t('budgetUsageSubtitle')}</p>
          {!budgets || budgets.length === 0 ? (
            <p className="mt-8 text-center text-sm text-neutral-500">{t('budgetUsageEmpty')}</p>
          ) : (
            <div className="mt-4 space-y-4">
              {budgets.map((b) => {
                const allocated = BigInt(b.allocatedMinor);
                const spent = BigInt(b.spentMinor);
                const pct = allocated > 0n ? Math.min(100, Number((spent * 10000n) / allocated) / 100) : 0;
                const exceeded = spent > allocated;
                return (
                  <div key={b.budgetId}>
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                      <span>{b.budgetName}</span>
                      <span>
                        {formatMinor(spent, currency, minorUnits)} / {formatMinor(allocated, currency, minorUnits)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-full rounded-full ${exceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </motion.div>
      </>
      )}
    </div>
  );
}
