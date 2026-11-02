import { z } from 'zod';
import { validateAndNormalizeDomain } from '@/utils/domain-validator';

export const domainFormSchema = z.object({
  domain: z
    .string()
    .min(1, 'O domínio é obrigatório.')
    .superRefine((val, ctx) => {
      const res = validateAndNormalizeDomain(val);
      if (!res.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error || 'Formato de domínio inválido.',
        });
      }
    }),
  category: z.string().default('restricted_gambling'),
  evidence: z.string().min(3, 'Forneça uma justificativa ou evidência válida (mínimo 3 caracteres).'),
});

export type DomainFormValues = z.infer<typeof domainFormSchema>;

export const exceptionFormSchema = z.object({
  domain: z
    .string()
    .min(1, 'O domínio é obrigatório.')
    .superRefine((val, ctx) => {
      const res = validateAndNormalizeDomain(val);
      if (!res.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error || 'Formato de domínio inválido.',
        });
      }
    }),
  reason: z.string().min(3, 'Informe o motivo da liberação manual.'),
  expiresAt: z.string().nullable().optional(),
});

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

export const reviewFormSchema = z.object({
  reviewStatus: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
  reviewerNote: z.string().min(3, 'A nota de revisão deve conter no mínimo 3 caracteres.'),
});

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;
