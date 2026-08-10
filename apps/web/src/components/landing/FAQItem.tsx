import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export function FAQItem({ value, question, answer }: { value: string; question: string; answer: string }) {
  return (
    <AccordionItem value={value} className="border-neutral-200 px-1 dark:border-white/10">
      <AccordionTrigger className="py-4 text-base font-medium text-neutral-900 hover:no-underline dark:text-neutral-100">
        {question}
      </AccordionTrigger>
      <AccordionContent className="text-[0.95rem] leading-relaxed text-neutral-600 dark:text-neutral-400">
        {answer}
      </AccordionContent>
    </AccordionItem>
  );
}
