import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, "Informe seu e-mail")
  .email("E-mail inválido");

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres")
  .max(72, "A senha pode ter no máximo 72 caracteres");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo"),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string().min(1, "Confirme a senha"),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "As senhas não coincidem",
  });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const recoverSchema = z.object({ email: emailSchema });
export type RecoverValues = z.infer<typeof recoverSchema>;

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string().min(1, "Confirme a senha"),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "As senhas não coincidem",
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo"),
  headline: z.string().trim().max(160, "Máximo de 160 caracteres").optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(40).optional().or(z.literal("")),
});
export type ProfileValues = z.infer<typeof profileSchema>;
