import type { ComponentProps } from 'react';
import { Input } from './input';
import { AMOUNT_PATTERN, sanitizeAmountInput } from '@/lib/validation';

export interface AmountInputProps
  extends Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/** Digits-only amountMinor entry: strips letters/decimals so the value stays an unsigned bigint-safe integer string. */
export function AmountInput({ value, onValueChange, ...props }: AmountInputProps) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern={AMOUNT_PATTERN}
      value={value}
      onChange={(e) => onValueChange(sanitizeAmountInput(e.target.value))}
      {...props}
    />
  );
}
