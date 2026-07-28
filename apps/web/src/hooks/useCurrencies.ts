import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface Currency {
  code: string;
  minorUnits: number;
}

const DEFAULT_CURRENCIES: Currency[] = [{ code: 'XOF', minorUnits: 0 }];

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>(DEFAULT_CURRENCIES);

  useEffect(() => {
    apiClient
      .get<Currency[]>('/currencies')
      .then((list) => {
        if (list.length > 0) setCurrencies(list);
      })
      .catch(() => {
        // keep the XOF fallback if the public endpoint is unreachable
      });
  }, []);

  return currencies;
}
