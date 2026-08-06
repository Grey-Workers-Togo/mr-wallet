'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import {
  TrendingUp,
  Repeat,
  HandCoins,
  BarChart3,
  Smartphone,
  Gauge,
  Globe2,
  BookOpenCheck,
  ArrowRight,
  CheckCircle2,
  Wallet,
  Receipt,
  PiggyBank,
  FileSpreadsheet,
  LineChart,
  Boxes,
  Plug,
  ClipboardList,
  WifiOff,
  Languages,
  Coins,
  Ruler,
  ShieldCheck,
  Lock,
  FileCheck,
  Check,
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
import { ScreenshotsGallery } from '@/components/landing/ScreenshotsGallery';
import { TestimonialCard } from '@/components/landing/TestimonialCard';
import { cn } from '@/lib/utils';

const FEATURE_ICONS = [Wallet, Receipt, Repeat, BarChart3, HandCoins, PiggyBank, FileSpreadsheet, LineChart, Gauge];
const PRINCIPLE_ICONS = [Boxes, Plug, ClipboardList, WifiOff, Smartphone, Languages, Coins, Ruler];
const SECURITY_ICONS = [Lock, FileCheck, ShieldCheck];
const SECTION_GRADIENT = 'bg-gradient-to-br from-bg-secondary via-primary/5 to-primary/10';
const ROUNDED_BUTTON = 'rounded-full';

export default function HomePage() {
  const t = useTranslations('home');
  const reduce = useReducedMotion();

  const features = t.raw('features.items') as { title: string; description: string }[];
  const principles = t.raw('principles.items') as { title: string; description: string }[];
  const securityItems = t.raw('security.items') as { title: string; description: string }[];
  const securityLog = t.raw('security.log.lines') as { time: string; action: string; target: string }[];
  const steps = t.raw('howItWorks.steps') as { title: string; description: string }[];
  const faqs = t.raw('faq.items') as { question: string; answer: string }[];
  const testimonials = t.raw('testimonials.items') as { name: string; role: string; quote: string }[];
  const controlPoints = t.raw('controlCta.points') as string[];

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className={cn('relative grid gap-10 overflow-hidden px-4 py-16 md:grid-cols-2 md:items-center md:px-12 md:py-24', SECTION_GRADIENT)}>
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
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10 order-1 flex items-center justify-center md:order-2"
        >
          <div className="aspect-video w-full max-w-lg overflow-hidden rounded-2xl shadow-xl">
            <iframe
              className="size-full"
              src="https://www.youtube.com/embed/VwYdEFJwzeY"
              title="Mr Wallet"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 order-2 flex flex-col items-center gap-6 text-center md:order-1 md:items-start md:text-left"
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
            className="flex flex-wrap items-center justify-center gap-2 md:justify-start"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-medium text-primary-dark shadow-sm">
              <Globe2 aria-hidden className="size-3.5" />
              {t('hero.badge')}
            </span>
            <a
              href="https://www.producthunt.com/products/mr-wallet-budget-finance-management?utm_source=other&utm_medium=social"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-white/70 px-3 py-1 text-xs font-medium text-orange-600 shadow-sm transition-colors hover:bg-white"
            >
              <svg aria-hidden viewBox="0 0 40 40" className="size-3.5" fill="currentColor">
                <path d="M20 0C8.95 0 0 8.95 0 20s8.95 20 20 20 20-8.95 20-20S31.05 0 20 0zm4.5 24h-6v6h-4V10h10a7 7 0 010 14zm0-4a3 3 0 000-6h-6v6h6z" />
              </svg>
              {t('hero.producthuntBadge')}
            </a>
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
              className={cn(buttonVariants({ size: 'lg' }), ROUNDED_BUTTON, 'transition-shadow hover:shadow-[0_0_20px_var(--color-primary-light)]')}
            >
              {t('hero.ctaPrimary')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="#features" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), ROUNDED_BUTTON)}>
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
      </section>

      {/* Features / Modules */}
      <section id="features" className={cn('px-4 py-16 md:px-12 md:py-24', SECTION_GRADIENT)}>
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

      {/* Principles */}
      <section id="principes" className="px-4 py-16 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">{t('principles.title')}</h2>
          <p className="mt-3 text-base text-neutral-600">{t('principles.subtitle')}</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-2">
          {principles.map((principle, index) => {
            const Icon = PRINCIPLE_ICONS[index % PRINCIPLE_ICONS.length] ?? TrendingUp;
            return (
              <motion.div
                key={principle.title}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: Math.min(index, 5) * 0.08 }}
                whileHover={reduce ? undefined : { y: -3 }}
              >
                <Card className="flex h-full flex-row items-start gap-4 p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-neutral-900">{principle.title}</h3>
                    <p className="mt-1 text-sm text-neutral-600">{principle.description}</p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Security & traceability */}
      <section id="securite" className={cn('px-4 py-16 md:px-12 md:py-24', SECTION_GRADIENT)}>
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-2 md:items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-sm font-semibold tracking-widest text-primary uppercase">{t('security.badge')}</span>
            <h2 className="mt-3 text-2xl font-semibold text-neutral-900 md:text-3xl">{t('security.title')}</h2>
            <p className="mt-4 text-base text-neutral-600">{t('security.description')}</p>
            <ul className="mt-8 space-y-4">
              {securityItems.map((item, index) => {
                const Icon = SECURITY_ICONS[index % SECURITY_ICONS.length] ?? ShieldCheck;
                return (
                  <li key={item.title} className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                      <p className="text-sm text-neutral-600">{item.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-3xl bg-primary/10 blur-2xl" aria-hidden />
            <Card className="relative gap-0 p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <span className="text-sm font-semibold text-neutral-900">{t('security.log.label')}</span>
                <span className="text-xs text-neutral-500">{t('security.log.sublabel')}</span>
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs">
                {securityLog.map((line) => {
                  const color =
                    line.action === 'DELETE'
                      ? 'text-rose-500'
                      : line.action === 'UPDATE'
                        ? 'text-amber-600'
                        : 'text-primary';
                  return (
                    <div key={`${line.time}-${line.target}`} className="flex items-center gap-3 rounded-lg bg-bg-secondary px-3 py-2">
                      <span className="text-neutral-500">{line.time}</span>
                      <span className={cn('font-semibold', color)}>{line.action}</span>
                      <span className="truncate text-neutral-600">{line.target}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-y border-border bg-neutral-950 px-4 py-16 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">{t('screenshots.title')}</h2>
          <p className="mt-3 text-base text-neutral-400">{t('screenshots.subtitle')}</p>
        </div>
        <div className="mt-10">
          <ScreenshotsGallery alt={t('screenshots.alt')} />
        </div>
      </section>

      {/* Designed for West Africa */}
      <section className={cn('border-y border-border px-4 py-16 md:px-12 md:py-24', SECTION_GRADIENT)}>
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">{t('designedFor.title')}</h2>
            <p className="mt-4 text-base text-neutral-600">{t('designedFor.description')}</p>
            <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), ROUNDED_BUTTON, 'mt-6')}>
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
      <section className={cn('px-4 py-16 md:px-12 md:py-24', SECTION_GRADIENT)}>
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

      {/* Testimonials */}
      <section className="px-4 py-16 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">{t('testimonials.title')}</h2>
          <p className="mt-3 text-base text-neutral-600">{t('testimonials.subtitle')}</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
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

      {/* Reprenez le contrôle */}
      <section className={cn('border-y border-border px-4 py-16 md:px-12 md:py-24', SECTION_GRADIENT)}>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-neutral-900 px-8 py-16 text-center md:px-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-[100px]"
          />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t('controlCta.title')}</h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-neutral-300 md:text-lg">{t('controlCta.description')}</p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className={cn(buttonVariants({ size: 'lg' }), ROUNDED_BUTTON, 'transition-transform hover:scale-[1.03]')}
              >
                {t('controlCta.primary')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href="#features"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  ROUNDED_BUTTON,
                  'border-white/20 bg-transparent text-white hover:bg-white/10',
                )}
              >
                {t('controlCta.secondary')}
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-400">
              {controlPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-4 text-primary" />
                  {point}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-16 md:px-12 md:py-24">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">{t('faq.title')}</h2>
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
      <section className={cn('flex flex-col items-center gap-4 px-4 py-16 text-center md:px-12 md:py-24', SECTION_GRADIENT)}>
        <h2 className="text-2xl font-semibold text-neutral-900">{t('ctaFinal.title')}</h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <motion.div whileHover={reduce ? undefined : { scale: 1.05 }}>
            <Link href="/register" className={cn(buttonVariants({ size: 'lg' }), ROUNDED_BUTTON)}>
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
          <Link href="/account-deletion" className="hover:text-white">
            {t('footer.accountDeletion')}
          </Link>
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
