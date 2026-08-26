import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { AuthLayout, FieldError } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { newPasswordSchema, type NewPasswordValues } from "@/lib/auth-schemas";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirmando acesso — RUMVIA" },
      { name: "description", content: "Estamos concluindo a autenticação da sua conta RUMVIA." },
      { property: "og:title", content: "Confirmando acesso — RUMVIA" },
      { property: "og:description", content: "Conclusão do login no RUMVIA." },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isOnboarded, isAuthenticated, loading } = useAuth();
  const [mode, setMode] = React.useState<"processando" | "recuperacao">("processando");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isRecovery =
      params.get("tipo") === "recuperacao" ||
      params.get("type") === "recovery" ||
      hash.get("type") === "recovery";
    if (isRecovery) setMode("recuperacao");
  }, []);

  React.useEffect(() => {
    if (mode !== "processando" || loading) return;
    if (isAuthenticated) {
      void navigate({ to: isOnboarded ? "/dashboard" : "/onboarding", replace: true });
    }
  }, [mode, loading, isAuthenticated, isOnboarded, navigate]);

  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  if (mode === "recuperacao") {
    return (
      <AuthLayout title="Definir nova senha" subtitle="Escolha uma senha nova para sua conta.">
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit(async (values) => {
            const { error } = await supabase.auth.updateUser({ password: values.password });
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Senha atualizada.");
            void navigate({ to: "/dashboard", replace: true });
          })}
        >
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova">
              Nova senha
            </label>
            <Input
              id="nova"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova2">
              Confirmar nova senha
            </label>
            <Input
              id="nova2"
              type="password"
              autoComplete="new-password"
              {...form.register("passwordConfirm")}
            />
            <FieldError message={form.formState.errors.passwordConfirm?.message} />
          </div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Salvar nova senha
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirmando acesso" subtitle="Um instante enquanto validamos sua sessão…">
      <p className="text-caption text-neutral-700">
        Se esta tela demorar, volte para a página inicial e tente entrar novamente.
      </p>
    </AuthLayout>
  );
}
