'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import {
  TrendingUp,
  Target,
  Repeat,
  HandCoins,
  BarChart3,
  Smartphone,
  Gauge,
  Globe2,
  BookOpenCheck,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuthSession } from '@/hooks/useAuthSession';
import { Accordion } from '@/components/ui/accordion';
import { Logo } from '@/components/shared/Logo';
import { SiteHeader } from '@/components/landing/SiteHeader';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { TimelineStep } from '@/components/landing/TimelineStep';
import { FAQItem } from '@/components/landing/FAQItem';
import { ScreenshotsGallery } from '@/components/landing/ScreenshotsGallery';
import { TestimonialCard } from '@/components/landing/TestimonialCard';
import { PricingCard } from '@/components/landing/PricingCard';
import { cn } from '@/lib/utils';

const FEATURE_ICONS = [BarChart3, Smartphone, Gauge, Target, Repeat, HandCoins];

const HERO_ROWS = [
  { key: 'row1', amount: '-12 500 F', negative: true },
  { key: 'row2', amount: '+50 000 F', negative: false },
  { key: 'row3', amount: '-18 000 F', negative: true },
] as const;

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-neutral-900 px-6 text-[0.95rem] font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

const SECTION_HEADING = 'text-3xl font-bold tracking-tight text-neutral-900 md:text-5xl dark:text-neutral-50';
const SECTION_SUBTITLE = 'mt-4 text-lg text-neutral-600 dark:text-neutral-400';
const BAND = 'border-y border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.02]';

export default function HomeView() {
  const t = useTranslations('home');
  const reduce = useReducedMotion();
  const session = useAuthSession();
  const isAuthenticated = session === 'authenticated';

  const features = t.raw('features.items') as { title: string; description: string }[];
  const steps = t.raw('howItWorks.steps') as { title: string; description: string }[];
  const faqs = t.raw('faq.items') as { question: string; answer: string }[];
  const testimonials = t.raw('testimonials.items') as { name: string; role: string; quote: string }[];
  const plans = t.raw('pricing.plans') as {
    name: string;
    price: string;
    period?: string;
    badge?: string;
    cta: string;
    features: string[];
  }[];

  const trust = [
    { icon: Globe2, title: t('hero.trust.multiCurrencyTitle'), desc: t('hero.trust.multiCurrencyDescription') },
    { icon: BookOpenCheck, title: t('hero.trust.ledgerTitle'), desc: t('hero.trust.ledgerDescription') },
    { icon: Smartphone, title: t('hero.trust.mobileTitle'), desc: t('hero.trust.mobileDescription') },
  ] as const;

  return (
    <>
      <SiteHeader />
      <main className="flex flex-col bg-white text-neutral-900 dark:bg-[#0a0a0d] dark:text-neutral-100">
        {/* Hero */}
        <section className="relative -mt-16 overflow-hidden bg-white dark:bg-[#0a0a0d]">
          {/* soft top glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
            style={{
              background:
                'radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--color-primary) 18%, transparent), transparent 70%)',
            }}
          />

          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-32 pb-16 text-center md:pt-40 md:pb-20">
            <motion.span
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-100 px-3.5 py-1.5 text-xs font-medium text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {t('hero.badge')}
            </motion.span>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-7 text-5xl leading-[1.02] font-bold tracking-[-0.02em] text-neutral-900 md:text-7xl dark:text-neutral-50"
            >
              {t('hero.tagline')}
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600 dark:text-neutral-400"
            >
              {t('hero.description')}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-9 flex flex-col items-center gap-4 sm:flex-row"
            >
              <Link href={isAuthenticated ? '/accounts' : '/register'} className={PRIMARY_BUTTON}>
                {isAuthenticated ? t('accessMySpace') : t('hero.ctaPrimary')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a
                href="#features"
                className="group inline-flex h-12 items-center gap-1.5 rounded-xl border border-neutral-300 px-6 text-[0.95rem] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/5"
              >
                {t('hero.ctaSecondary')}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </motion.div>

            {/* Trust bar */}
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              {trust.map((item, i) => (
                <li key={item.title} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="hidden h-3.5 w-px bg-neutral-200 sm:block dark:bg-white/10" />
                  )}
                  <item.icon aria-hidden className="size-4 text-primary" />
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{item.title}</span>
                  <span className="text-neutral-500">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Product statement panel */}
          <div className="relative mx-auto max-w-md px-4 pb-20 md:pb-28">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl md:p-6 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-2xl dark:backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">{t('hero.mock.dailyBudget')}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <span aria-hidden className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  {t('hero.mock.stable')}
                </span>
              </div>
              <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50">
                18 450 F <span className="text-base font-normal text-neutral-400 dark:text-neutral-500">{t('hero.mock.perDay')}</span>
              </p>

              {/* sparkline */}
              <svg viewBox="0 0 300 64" className="mt-4 h-16 w-full" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,44 L40,40 L80,46 L120,30 L160,34 L200,20 L240,26 L300,10 L300,64 L0,64 Z"
                  fill="url(#hero-spark)"
                />
                <motion.path
                  d="M0,44 L40,40 L80,46 L120,30 L160,34 L200,20 L240,26 L300,10"
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 0.7, ease: 'easeOut' }}
                />
              </svg>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="text-xs tracking-wide text-neutral-500 uppercase">
                    {t('hero.mock.totalBalance')}
                  </span>
                  <p className="mt-1 text-lg font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
                    1 248 000 F
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                    <motion.div
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: '68%' }}
                      transition={{ duration: 0.8, delay: 0.9, ease: 'easeOut' }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="text-xs tracking-wide text-neutral-500 uppercase">{t('hero.mock.savings')}</span>
                  <p className="mt-1 text-lg font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">32%</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                    <motion.div
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: '32%' }}
                      transition={{ duration: 0.8, delay: 1, ease: 'easeOut' }}
                      className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {HERO_ROWS.map((row, i) => (
                  <motion.div
                    key={row.key}
                    initial={reduce ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 1.1 + i * 0.1 }}
                    className="flex items-center justify-between border-b border-neutral-200 pb-3 last:border-0 last:pb-0 dark:border-white/10"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
                        {t(`hero.mock.${row.key}Label`)}
                      </p>
                      <p className="text-xs text-neutral-500">{t(`hero.mock.${row.key}Sub`)}</p>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        row.negative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {row.amount}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 bg-white px-4 py-20 md:px-12 md:py-28 dark:bg-[#0a0a0d]">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className={SECTION_HEADING}>{t('features.title')}</h2>
            <p className={SECTION_SUBTITLE}>{t('features.subtitle')}</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                icon={FEATURE_ICONS[index % FEATURE_ICONS.length] ?? TrendingUp}
                title={feature.title}
                description={feature.description}
                index={index}
              />
            ))}
          </div>
        </section>

        {/* Screenshots */}
        <section className={cn(BAND, 'px-4 py-20 md:px-12 md:py-28')}>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className={SECTION_HEADING}>{t('screenshots.title')}</h2>
            <p className={SECTION_SUBTITLE}>{t('screenshots.subtitle')}</p>
          </div>
          <div className="mt-14">
            <ScreenshotsGallery alt={t('screenshots.alt')} />
          </div>
        </section>

        {/* Designed for West Africa */}
        <section className="bg-white px-4 py-20 md:px-12 md:py-28 dark:bg-[#0a0a0d]">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl dark:text-neutral-50">
                {t('designedFor.title')}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
                {t('designedFor.description')}
              </p>
              <Link href="/register" className={cn(PRIMARY_BUTTON, 'mt-8')}>
                {t('designedFor.cta')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </motion.div>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{t('designedFor.whyTitle')}</h3>
                <ul className="mt-4 space-y-3">
                  {(t.raw('designedFor.reasons') as string[]).map((reason) => (
                    <li
                      key={reason}
                      className="flex items-start gap-2.5 text-[0.95rem] text-neutral-700 dark:text-neutral-300"
                    >
                      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={cn('scroll-mt-16 px-4 py-20 md:px-12 md:py-28', BAND)}>
          <h2 className={cn(SECTION_HEADING, 'mb-14 text-center')}>{t('howItWorks.title')}</h2>
          <div className="mx-auto flex max-w-4xl flex-col gap-10 md:flex-row">
            {steps.map((step, index) => (
              <TimelineStep
                key={step.title}
                step={index + 1}
                title={step.title}
                description={step.description}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-white px-4 py-20 md:px-12 md:py-28 dark:bg-[#0a0a0d]">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className={SECTION_HEADING}>{t('testimonials.title')}</h2>
            <p className={SECTION_SUBTITLE}>{t('testimonials.subtitle')}</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard
                key={testimonial.name}
                name={testimonial.name}
                role={testimonial.role}
                quote={testimonial.quote}
                index={index}
              />
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className={cn('scroll-mt-16 px-4 py-20 md:px-12 md:py-28', BAND)}>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className={SECTION_HEADING}>{t('pricing.title')}</h2>
            <p className={SECTION_SUBTITLE}>{t('pricing.subtitle')}</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-3xl gap-6 md:grid-cols-2">
            {plans.map((plan, index) => (
              <PricingCard
                key={plan.name}
                name={plan.name}
                price={plan.price}
                period={plan.period}
                badge={plan.badge}
                features={plan.features}
                ctaLabel={plan.cta}
                href={index === 0 ? '/register' : 'mailto:contact@mister-wallet.com?subject=Mr%20Wallet%20Pro'}
                highlighted={index === 0}
                index={index}
              />
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 bg-white px-4 py-20 md:px-12 md:py-28 dark:bg-[#0a0a0d]">
          <h2 className={cn(SECTION_HEADING, 'mb-12 text-center')}>{t('faq.title')}</h2>
          <Accordion className="mx-auto max-w-2xl" multiple>
            {faqs.map((faq, index) => (
              <FAQItem key={faq.question} value={`faq-${index}`} question={faq.question} answer={faq.answer} />
            ))}
          </Accordion>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faqs.map((faq) => ({
                  '@type': 'Question',
                  name: faq.question,
                  acceptedAnswer: { '@type': 'Answer', text: faq.answer },
                })),
              }),
            }}
          />
        </section>

        {/* CTA final */}
        <section className="relative overflow-hidden bg-white px-4 py-24 text-center md:py-32 dark:bg-[#0a0a0d]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[380px]"
            style={{
              background:
                'radial-gradient(60% 100% at 50% 100%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 70%)',
            }}
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className={SECTION_HEADING}>{t('ctaFinal.title')}</h2>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
              <motion.div whileHover={reduce ? undefined : { scale: 1.03 }}>
                <Link href="/register" className={PRIMARY_BUTTON}>
                  {t('ctaFinal.primary')}
                </Link>
              </motion.div>
              <span className="text-neutral-600 dark:text-neutral-400">
                {t('ctaFinal.secondaryPrefix')}{' '}
                <Link
                  href="/login"
                  className="text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
                >
                  {t('ctaFinal.secondary')}
                </Link>
              </span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-neutral-200 bg-white dark:border-white/10 dark:bg-[#0a0a0d]">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
            <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
              {/* Brand */}
              <div className="flex flex-col gap-4">
                <Logo size={30} textClassName="text-neutral-900 dark:text-white" />
                <p className="max-w-xs text-sm text-neutral-500">{t('footer.description')}</p>
                <div className="flex flex-wrap gap-2">
                  {trust.map((item) => (
                    <span
                      key={item.title}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-400"
                    >
                      <item.icon aria-hidden className="size-3.5 text-primary" />
                      {item.title}
                    </span>
                  ))}
                </div>
              </div>

              {/* Product */}
              <nav className="flex flex-col gap-3 text-sm">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{t('footer.productTitle')}</span>
                <a href="#features" className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white">
                  {t('nav.features')}
                </a>
                <a href="#how" className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white">
                  {t('nav.howItWorks')}
                </a>
                <a href="#pricing" className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white">
                  {t('nav.pricing')}
                </a>
                <a href="#faq" className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white">
                  {t('nav.faq')}
                </a>
              </nav>

              {/* Resources */}
              <nav className="flex flex-col gap-3 text-sm">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{t('footer.linksTitle')}</span>
                <a href="/docs" className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white">
                  {t('footer.docs')}
                </a>
                <a
                  href="mailto:contact@mister-wallet.com"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white"
                >
                  {t('footer.contact')}
                </a>
                <Link
                  href="/account-deletion"
                  className="text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-white"
                >
                  {t('footer.accountDeletion')}
                </Link>
              </nav>
            </div>

            <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-neutral-200 pt-6 sm:flex-row dark:border-white/10">
              <span className="text-xs text-neutral-500">
                © {new Date().getFullYear()} Mr Wallet. {t('footer.rights')}
              </span>
              <a
                href="https://github.com/Grey-Workers-Togo/mr-wallet"
                target="_blank"
                rel="noreferrer"
                aria-label={t('footer.github')}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-white/10 dark:hover:border-white/20 dark:hover:text-white"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4">
                  <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.62-2.8 5.64-5.48 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
