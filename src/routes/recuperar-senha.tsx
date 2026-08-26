import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { recoverSchema, type RecoverValues } from "@/lib/auth-schemas";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — RUMVIA" },
      { name: "description", content: "Receba um link por e-mail para redefinir sua senha do RUMVIA." },
      { property: "og:title", content: "Recuperar senha — RUMVIA" },
      { property: "og:description", content: "Redefina a senha da sua conta RUMVIA." },
    ],
  }),
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const auth = useAuth();
  const [sent, setSent] = React.useState(false);

  const form = useForm<RecoverValues>({
    resolver: zodResolver(recoverSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: RecoverValues) {
    const { error } = await auth.resetPassword(values.email);
    if (error) {
      toast.error(error);
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle="Enviaremos um link de redefinição para o seu e-mail."
      footer={
        <p className="text-caption text-neutral-700">
          Lembrou a senha?{" "}
          <Link to="/login" className="text-accent-700 underline">
            Entrar
          </Link>
        </p>
      }
    >
      {sent ? (
        <p className="border border-divider bg-neutral-100 p-3 text-caption text-neutral-700">
          Se existir uma conta com esse e-mail, o link de redefinição já está a caminho. Verifique
          também a caixa de spam.
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="email">
              E-mail
            </label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message} />
          </div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Enviar link de redefinição
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
