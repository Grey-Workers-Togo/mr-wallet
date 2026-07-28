import { z } from 'zod';

export const listNotificationsSchema = z
  .object({
    unreadOnly: z.coerce.boolean().default(false),
  })
  .strict();
export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;

const notificationTypeEnum = z.enum([
  'BUDGET_THRESHOLD',
  'BUDGET_EXCEEDED',
  'DEBT_DUE_SOON',
  'DEBT_OVERDUE',
  'DEBT_PAID_OFF',
  'GOAL_REACHED',
  'RECURRENCE_DUE',
  'IMPORT_COMPLETED',
  'IMPORT_FAILED',
  'BALANCE_MISMATCH',
]);

export const updatePreferencesSchema = z
  .array(
    z
      .object({
        type: notificationTypeEnum,
        inAppEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
      })
      .strict(),
  )
  .min(1)
  .max(notificationTypeEnum.options.length);
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>;

export const subscribePushSchema = z
  .object({
    endpoint: z.string().url(),
    p256dhKey: z.string().min(1),
    authKey: z.string().min(1),
    deviceLabel: z.string().max(100).optional(),
  })
  .strict();
export type SubscribePushDto = z.infer<typeof subscribePushSchema>;

export const unsubscribePushSchema = z
  .object({
    endpoint: z.string().url(),
  })
  .strict();
export type UnsubscribePushDto = z.infer<typeof unsubscribePushSchema>;
