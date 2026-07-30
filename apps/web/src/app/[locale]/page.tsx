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
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion } from '@/components/ui/accordion';
import { Logo } from '@/components/shared/Logo';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { TimelineStep } from '@/components/landing/TimelineStep';
import { FAQItem } from '@/components/landing/FAQItem';
import { cn } from '@/lib/utils';

const FEATURE_ICONS = [BarChart3, Smartphone, Gauge, Target, Repeat, HandCoins];

export default function HomePage() {
  const t = useTranslations('home');
  const reduce = useReducedMotion();

  const features = t.raw('features.items') as { title: string; description: string }[];
  const steps = t.raw('howItWorks.steps') as { title: string; description: string }[];
  const faqs = t.raw('faq.items') as { question: string; answer: string }[];

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="relative grid gap-10 overflow-hidden bg-gradient-to-br from-bg-secondary via-primary/5 to-primary/10 px-4 py-16 md:grid-cols-2 md:items-center md:px-12 md:py-24">
        <div className="absolute top-4 right-4 z-20 md:top-6 md:right-6">
          <LanguageSwitcher />
        </div>
        <motion.div
          aria-hidden
          animate={reduce ? undefined : { x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 -left-24 size-72 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          aria-hidden
          animate={reduce ? undefined : { x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-16 bottom-0 size-80 rounded-full bg-primary-light/20 blur-3xl"
        />
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex flex-col items-center gap-6 text-center md:items-start md:text-left"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0 }}
          >
            <Logo size={40} />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-medium text-primary-dark shadow-sm"
          >
            <Globe2 aria-hidden className="size-3.5" />
            {t('hero.badge')}
          </motion.div>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-4xl font-bold tracking-tight text-neutral-900 md:text-5xl"
          >
            {t('hero.tagline')}
          </motion.h1>
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="max-w-md text-base text-neutral-600"
          >
            {t('hero.description')}
          </motion.p>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex flex-wrap justify-center gap-3 md:justify-start"
          >
            <Link
              href="/register"
              className={cn(buttonVariants({ size: 'lg' }), 'transition-shadow hover:shadow-[0_0_20px_var(--color-primary-light)]')}
            >
              {t('hero.ctaPrimary')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="#features" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              {t('hero.ctaSecondary')}
            </Link>
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-4 grid grid-cols-3 gap-6 text-left"
          >
            {(
              [
                { icon: Globe2, title: t('hero.trust.multiCurrencyTitle'), description: t('hero.trust.multiCurrencyDescription') },
                { icon: BookOpenCheck, title: t('hero.trust.ledgerTitle'), description: t('hero.trust.ledgerDescription') },
                { icon: Smartphone, title: t('hero.trust.mobileTitle'), description: t('hero.trust.mobileDescription') },
              ] as const
            ).map((item) => (
              <div key={item.title} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                  <item.icon aria-hidden className="size-3.5 text-primary" />
                  {item.title}
                </div>
                <span className="text-xs text-neutral-500">{item.description}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative z-10 hidden md:flex md:items-center md:justify-center"
        >
          <Card className="w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">{t('hero.mock.dailyBudget')}</span>
              <Badge className="bg-emerald-100 text-emerald-700">{t('hero.mock.stable')}</Badge>
            </div>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              18 450 F <span className="text-sm font-normal text-neutral-500">{t('hero.mock.perDay')}</span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <span className="text-xs tracking-wide text-neutral-500 uppercase">{t('hero.mock.totalBalance')}</span>
                <p className="mt-1 text-lg font-semibold text-neutral-900">1 248 000 F</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '68%' }}
                    transition={{ duration: 0.8, delay: 0.9, ease: 'easeOut' }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <span className="text-xs tracking-wide text-neutral-500 uppercase">{t('hero.mock.savings')}</span>
                <p className="mt-1 text-lg font-semibold text-neutral-900">32%</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '32%' }}
                    transition={{ duration: 0.8, delay: 1, ease: 'easeOut' }}
                    className="h-full rounded-full bg-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {(
                [
                  { label: t('hero.mock.row1Label'), sub: t('hero.mock.row1Sub'), amount: '-12 500 F', negative: true },
                  { label: t('hero.mock.row2Label'), sub: t('hero.mock.row2Sub'), amount: '+50 000 F', negative: false },
                  { label: t('hero.mock.row3Label'), sub: t('hero.mock.row3Sub'), amount: '-18 000 F', negative: true },
                ] as const
              ).map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 1.1 + i * 0.1 }}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{row.label}</p>
                    <p className="text-xs text-neutral-500">{row.sub}</p>
                  </div>
                  <span className={cn('text-sm font-semibold', row.negative ? 'text-red-600' : 'text-emerald-600')}>
                    {row.amount}
                  </span>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-16 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">{t('features.title')}</h2>
          <p className="mt-3 text-base text-neutral-600">{t('features.subtitle')}</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
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

      {/* Designed for West Africa */}
      <section className="border-y border-border bg-bg-secondary px-4 py-16 md:px-12 md:py-24">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">{t('designedFor.title')}</h2>
            <p className="mt-4 text-base text-neutral-600">{t('designedFor.description')}</p>
            <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), 'mt-6')}>
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
            <Card className="p-6">
              <h3 className="font-medium text-neutral-900">{t('designedFor.whyTitle')}</h3>
              <ul className="mt-4 space-y-3">
                {(t.raw('designedFor.reasons') as string[]).map((reason) => (
                  <li key={reason} className="flex items-start gap-2 text-sm text-neutral-700">
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    {reason}
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gradient-to-b from-bg-secondary to-primary/5 px-4 py-16 md:px-12 md:py-24">
        <h2 className="mb-12 text-center text-2xl font-semibold text-neutral-900">
          {t('howItWorks.title')}
        </h2>
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

      {/* FAQ */}
      <section className="px-4 py-16 md:px-12 md:py-24">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">{t('faq.title')}</h2>
        <Accordion className="mx-auto max-w-2xl" multiple>
          {faqs.map((faq, index) => (
            <FAQItem key={faq.question} value={`faq-${index}`} question={faq.question} answer={faq.answer} />
          ))}
        </Accordion>
      </section>

      {/* CTA final */}
      <section className="flex flex-col items-center gap-4 bg-gradient-to-br from-bg-secondary via-primary/5 to-primary/10 px-4 py-16 text-center md:px-12 md:py-24">
        <h2 className="text-2xl font-semibold text-neutral-900">{t('ctaFinal.title')}</h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <motion.div whileHover={reduce ? undefined : { scale: 1.05 }}>
            <Link href="/register" className={cn(buttonVariants({ size: 'lg' }))}>
              {t('ctaFinal.primary')}
            </Link>
          </motion.div>
          <span className="text-neutral-600">
            {t('ctaFinal.secondaryPrefix')}{' '}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              {t('ctaFinal.secondary')}
            </Link>
          </span>
        </div>
      </section>

      {/* Footer */}
      <footer className="grid gap-8 bg-neutral-900 px-4 py-12 text-sm text-neutral-400 md:grid-cols-4 md:px-12">
        <div className="col-span-2 flex flex-col gap-2">
          <Logo size={28} textClassName="text-white" />
          <p>{t('footer.description')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-medium text-white">{t('footer.linksTitle')}</span>
          <a href="/docs" className="hover:text-white">
            {t('footer.docs')}
          </a>
          <a
            href="https://github.com/Grey-Workers-Togo/mr-wallet"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white"
          >
            {t('footer.github')}
          </a>
          <a href="mailto:contact@mister-wallet.com" className="hover:text-white">
            {t('footer.contact')}
          </a>
        </div>
        <div className="flex items-end justify-start md:justify-end">
          <span>
            © {new Date().getFullYear()} Mr Wallet. {t('footer.rights')}
          </span>
        </div>
      </footer>
    </main>
  );
}
