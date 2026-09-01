import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/auth/auth-layout";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { reauthSchema, type ReauthValues } from "@/lib/auth-schemas";

export interface ReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a senha atual é confirmada. Pode ser assíncrono. */
  onConfirmed: () => void | Promise<void>;
  title?: string;
  description?: string;
}

/**
 * "Modo sudo": reconfirma a identidade do usuário com a senha atual antes de
 * uma ação sensível (excluir conta, trocar senha, trocar e-mail...). A sessão
 * em memória pode ter horas — não é prova de que quem está na frente da tela
 * agora é o dono da conta. Use junto com `useReauthGate`.
 *
 * Contas só-Google (sem identidade de e-mail/senha) não têm senha para
 * confirmar aqui; nesse caso pedimos para sair e entrar de novo.
 */
export function ReauthDialog({
  open,
  onOpenChange,
  onConfirmed,
  title = "Confirme sua senha",
  description = "Por segurança, confirme sua senha atual para continuar.",
}: ReauthDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasPassword = Boolean(
    (user?.app_metadata as { providers?: string[] } | undefined)?.providers?.includes("email"),
  );
  const [confirming, setConfirming] = React.useState(false);

  const form = useForm<ReauthValues>({
    resolver: zodResolver(reauthSchema),
    defaultValues: { password: "" },
  });

  React.useEffect(() => {
    if (open) form.reset({ password: "" });
  }, [open, form]);

  async function onSubmit(values: ReauthValues) {
    if (!user?.email) {
      form.setError("password", { message: "Não foi possível identificar sua conta." });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: values.password,
    });
    if (error) {
      form.setError("password", { message: "Senha incorreta." });
      return;
    }

    setConfirming(true);
    try {
      await onConfirmed();
      onOpenChange(false);
    } finally {
      setConfirming(false);
    }
  }

  async function sairEEntrarNovamente() {
    await supabase.auth.signOut();
    void navigate({ to: "/login", search: { redirect: window.location.pathname } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-accent-700" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {hasPassword ? (
          <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
            <div>
              <label className="label-h6 text-neutral-700" htmlFor="reauth-senha">
                Senha atual
              </label>
              <Input
                id="reauth-senha"
                type="password"
                autoComplete="current-password"
                autoFocus
                {...form.register("password")}
              />
              <FieldError message={form.formState.errors.password?.message} />
            </div>
            <Button type="submit" loading={form.formState.isSubmitting || confirming}>
              Confirmar
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-caption text-neutral-700">
              Sua conta usa login com Google e não tem senha cadastrada. Saia e entre novamente para
              confirmar esta ação.
            </p>
            <Button variant="outline" onClick={sairEEntrarNovamente}>
              Sair e entrar novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
