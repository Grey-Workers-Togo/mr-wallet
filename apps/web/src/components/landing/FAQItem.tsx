import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export function FAQItem({ value, question, answer }: { value: string; question: string; answer: string }) {
  return (
    <AccordionItem value={value} className="px-1">
      <AccordionTrigger className="py-4 text-base font-medium hover:no-underline">
        {question}
      </AccordionTrigger>
      <AccordionContent className="text-base text-neutral-600">{answer}</AccordionContent>
    </AccordionItem>
  );
}
