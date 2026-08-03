'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

const SCREENSHOTS = [
  { src: '/screenshots/phone1.png', width: 1080, height: 1920 },
  { src: '/screenshots/phone2.png', width: 1080, height: 1920 },
  { src: '/screenshots/phone3.png', width: 1080, height: 1920 },
  { src: '/screenshots/phone4.png', width: 1080, height: 1920 },
];

export function ScreenshotsGallery({ alt }: { alt: string }) {
  const reduce = useReducedMotion();

  return (
    <div className="mx-auto flex max-w-5xl snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 md:justify-center md:overflow-visible md:px-0">
      {SCREENSHOTS.map((shot, index) => (
        <motion.div
          key={shot.src}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          whileHover={reduce ? undefined : { y: -6 }}
          className="w-40 shrink-0 snap-center overflow-hidden rounded-3xl border-4 border-neutral-900 shadow-xl md:w-48"
        >
          <Image
            src={shot.src}
            alt={`${alt} ${index + 1}`}
            width={shot.width}
            height={shot.height}
            className="h-auto w-full"
            sizes="(min-width: 768px) 192px, 160px"
          />
        </motion.div>
      ))}
    </div>
  );
}
