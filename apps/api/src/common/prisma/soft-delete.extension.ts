import { Prisma } from '@prisma/client';

/**
 * Models carrying the soft-delete convention from docs/03 §1.
 * Technical support tables (IdempotencyKey, PasswordResetToken, …) are excluded on purpose.
 */
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Account',
  'Category',
  'Tag',
  'Transaction',
  'RecurrenceRule',
  'Budget',
  'Debt',
  'DebtPayment',
  'SavingsGoal',
  'GoalContribution',
  'ImportSource',
  'CategorizationRule',
]);

const READ_ACTIONS = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);

interface SoftDeleteDelegate {
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
}

function getDelegate(client: object, model: string): SoftDeleteDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as Record<string, unknown>)[key] as SoftDeleteDelegate;
}

/**
 * Every default read on a soft-delete model filters `deletedAt: null`, and every
 * `delete`/`deleteMany` becomes an update instead — per docs/03 §1: no physical DELETE.
 * Call `.withDeleted()` (see `withDeleted` extension below) for the explicit audit/export escape hatch.
 */
export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }

          if (READ_ACTIONS.has(operation)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = { ...typedArgs.where, deletedAt: typedArgs.where?.deletedAt ?? null };
            return query(typedArgs as typeof args);
          }

          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            // Cannot inject deletedAt into a unique filter; callers must check deletedAt themselves
            // when using findUnique on a soft-delete model.
            return query(args);
          }

          if (operation === 'delete') {
            const typedArgs = args as { where: Record<string, unknown> };
            return getDelegate(client, model).update({
              where: typedArgs.where,
              data: { deletedAt: new Date() },
            });
          }

          if (operation === 'deleteMany') {
            const typedArgs = args as { where?: Record<string, unknown> };
            return getDelegate(client, model).updateMany({
              where: typedArgs.where,
              data: { deletedAt: new Date() },
            });
          }

          return query(args);
        },
      },
    },
  }),
);
