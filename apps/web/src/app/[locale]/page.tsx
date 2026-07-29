'use client';

import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, Target, LineChart } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Accordion } from '@/components/ui/accordion';
import { Logo } from '@/components/shared/Logo';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { TimelineStep } from '@/components/landing/TimelineStep';
import { FAQItem } from '@/components/landing/FAQItem';
import { cn } from '@/lib/utils';

const FEATURE_ICONS = [TrendingUp, Target, LineChart];

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
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-3xl font-semibold text-neutral-900"
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
            </Link>
            <Link href="#features" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              {t('hero.ctaSecondary')}
            </Link>
          </motion.div>
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="relative z-10 hidden items-center justify-center md:flex"
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -12, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="flex size-56 items-center justify-center rounded-full bg-primary/10 shadow-lg md:size-72"
          >
            <motion.div
              animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <TrendingUp aria-hidden className="size-24 text-primary md:size-32" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-16 md:px-12 md:py-24">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">
          {t('features.title')}
        </h2>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
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
