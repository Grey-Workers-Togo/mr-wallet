import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** docs/03-modele-donnees.md §19 — seed data, no runtime dependency on any external rate provider. */
const CURRENCIES = [
  { code: 'XOF', name: 'Franc CFA (UEMOA)', symbol: 'CFA', minorUnits: 0 },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnits: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', minorUnits: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', minorUnits: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', minorUnits: 2 },
  { code: 'XAF', name: 'Franc CFA (CEMAC)', symbol: 'FCFA', minorUnits: 0 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', minorUnits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', minorUnits: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', minorUnits: 2 },
];

const PEGGED_RATES = [
  { fromCurrency: 'EUR', toCurrency: 'XOF', rate: '655.957' },
  { fromCurrency: 'XOF', toCurrency: 'EUR', rate: '0.001524490172' },
  { fromCurrency: 'EUR', toCurrency: 'XAF', rate: '655.957' },
  { fromCurrency: 'XAF', toCurrency: 'EUR', rate: '0.001524490172' },
  { fromCurrency: 'XOF', toCurrency: 'XAF', rate: '1' },
  { fromCurrency: 'XAF', toCurrency: 'XOF', rate: '1' },
];

async function main() {
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: currency,
      create: currency,
    });
  }

  for (const peg of PEGGED_RATES) {
    const existing = await prisma.exchangeRate.findFirst({
      where: { fromCurrency: peg.fromCurrency, toCurrency: peg.toCurrency, source: 'PEGGED', userId: null },
    });
    if (!existing) {
      await prisma.exchangeRate.create({
        data: { ...peg, userId: null, source: 'PEGGED', validFrom: new Date('2020-01-01') },
      });
    }
  }

  console.log(`Seeded ${CURRENCIES.length} currencies and ${PEGGED_RATES.length} pegged rates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
