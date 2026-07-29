import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12),
    baseCurrency: z.string().length(3),
    timezone: z.string().min(1).optional(),
  })
  .strict();
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();
export type LoginDto = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().email() }).strict();
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(12),
  })
  .strict();
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
  })
  .strict();
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
