import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (format: 'zip', options: { zlib: { level: number } }) => {
  pipe: (dest: NodeJS.WritableStream) => void;
  append: (source: string, opts: { name: string }) => void;
  finalize: () => Promise<void>;
};
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { TagsFacade } from '../tags/tags.facade';
import { localeFromUserLocale } from '../categories/domain/category-i18n';
import { toCsv } from './domain/csv';
import { toDecimalString } from './domain/decimal-format';
import { ExportTransactionsDto } from './dto/export.dto';

const TRANSACTION_COLUMNS = [
  'id',
  'date_operation',
  'date_enregistrement',
  'compte',
  'type',
  'montant_mineur',
  'montant',
  'devise',
  'categorie',
  'sous_categorie',
  'beneficiaire',
  'description',
  'tags',
  'notes',
  'statut',
  'source',
  'lot_import',
  'reference_externe',
  'groupe_transfert',
];

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly transactionsFacade: TransactionsFacade,
    private readonly categoriesFacade: CategoriesFacade,
    private readonly tagsFacade: TagsFacade,
  ) {}

  private async buildTransactionRows(userId: string, filters: { accountId?: string; from?: Date; to?: Date }) {
    const [accounts, categories, tags, transactions, user] = await Promise.all([
      this.accountsFacade.list(userId),
      this.categoriesFacade.list(userId),
      this.tagsFacade.list(userId),
      this.transactionsFacade.listAllForExport(userId, filters),
      this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }),
    ]);

    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const tagById = new Map(tags.map((t) => [t.id, t.name]));
    const locale = localeFromUserLocale(user?.locale ?? 'fr');
    const currencyByCode = new Map(
      (await this.prisma.currency.findMany()).map((c) => [c.code, c]),
    );

    return transactions.map((tx) => {
      const account = accountById.get(tx.accountId);
      const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
      const parentCategory = category?.parentId ? categoryById.get(category.parentId) : undefined;
      const currency = currencyByCode.get(tx.currency);
      return {
        id: tx.id,
        date_operation: tx.occurredAt.toISOString().slice(0, 10),
        date_enregistrement: tx.createdAt.toISOString(),
        compte: account?.name ?? '',
        type: tx.type,
        montant_mineur: tx.amountMinor.toString(),
        montant: toDecimalString(tx.amountMinor, currency?.minorUnits ?? 2),
        devise: tx.currency,
        categorie: parentCategory ? this.categoriesFacade.resolveName(parentCategory, locale) : category ? this.categoriesFacade.resolveName(category, locale) : '',
        sous_categorie: parentCategory && category ? this.categoriesFacade.resolveName(category, locale) : '',
        beneficiaire: tx.payee ?? '',
        description: tx.description,
        tags: tx.tagIds.map((id) => tagById.get(id) ?? '').filter(Boolean).join('|'),
        notes: tx.notes ?? '',
        statut: tx.status,
        source: tx.source,
        lot_import: tx.importBatchId ?? '',
        reference_externe: tx.externalRef ?? '',
        groupe_transfert: tx.transferGroupId ?? '',
      };
    });
  }

  async exportTransactions(userId: string, dto: ExportTransactionsDto): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const rows = await this.buildTransactionRows(userId, { accountId: dto.accountId, from: dto.from, to: dto.to });

    if (dto.format === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = TRANSACTION_COLUMNS.map((key) => ({ header: key, key, width: 18 }));
      sheet.addRows(rows);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return { buffer, filename: 'transactions.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }

    const csv = toCsv(rows, TRANSACTION_COLUMNS);
    return { buffer: Buffer.from(csv, 'utf-8'), filename: 'transactions.csv', contentType: 'text/csv; charset=utf-8' };
  }

  /**
   * docs/06 §10: ZIP archive with one CSV per entity + `manifest.json`. Scoped to the modules
   * that exist as of Lot 3 (accounts, transactions, categories, tags, categorization rules,
   * exchange rates) — budgets/debts/goals/recurrences land in later lots and are added then.
   */
  async exportFull(userId: string): Promise<{ stream: NodeJS.ReadableStream; filename: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const [accounts, transactions, categories, tags, rules, rates] = await Promise.all([
      this.accountsFacade.list(userId),
      this.buildTransactionRows(userId, {}),
      this.categoriesFacade.list(userId),
      this.tagsFacade.list(userId),
      this.prisma.categorizationRule.findMany({ where: { userId } }),
      this.prisma.exchangeRate.findMany({ where: { OR: [{ userId }, { userId: null }] } }),
    ]);

    const files: { name: string; rows: number; content: string }[] = [
      {
        name: 'accounts.csv',
        rows: accounts.length,
        content: toCsv(
          accounts.map((a) => ({ ...a, openingBalanceMinor: a.openingBalanceMinor.toString(), currentBalanceMinor: a.currentBalanceMinor.toString() })),
          ['id', 'name', 'type', 'currency', 'openingBalanceMinor', 'currentBalanceMinor', 'isArchived'],
        ),
      },
      { name: 'transactions.csv', rows: transactions.length, content: toCsv(transactions, TRANSACTION_COLUMNS) },
      {
        name: 'categories.csv',
        rows: categories.length,
        content: toCsv(categories as unknown as Record<string, unknown>[], ['id', 'parentId', 'name', 'i18nKey', 'kind', 'isSystem']),
      },
      { name: 'tags.csv', rows: tags.length, content: toCsv(tags as unknown as Record<string, unknown>[], ['id', 'name', 'color']) },
      {
        name: 'categorization_rules.csv',
        rows: rules.length,
        content: toCsv(rules as unknown as Record<string, unknown>[], ['id', 'priority', 'matchField', 'matchType', 'matchValue', 'categoryId', 'isActive']),
      },
      {
        name: 'exchange_rates.csv',
        rows: rates.length,
        content: toCsv(
          rates.map((r) => ({ ...r, rate: r.rate.toString() })) as unknown as Record<string, unknown>[],
          ['id', 'fromCurrency', 'toCurrency', 'rate', 'source', 'validFrom'],
        ),
      },
    ];

    const manifest = {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      userId,
      baseCurrency: user?.baseCurrency ?? null,
      files: files.map((f) => ({ name: f.name, rows: f.rows, sha256: createHash('sha256').update(f.content).digest('hex') })),
    };

    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = new PassThrough();
    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    void archive.finalize();

    return { stream: output, filename: `budget-manager-export-${new Date().toISOString().slice(0, 10)}.zip` };
  }
}
