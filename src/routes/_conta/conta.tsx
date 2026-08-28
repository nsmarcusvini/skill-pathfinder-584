import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { FieldError } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  profileSchema,
  newPasswordSchema,
  type ProfileValues,
  type NewPasswordValues,
} from "@/lib/auth-schemas";

export const Route = createFileRoute("/_conta/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — RUMVIA" },
      {
        name: "description",
        content: "Edite seu perfil, troque a senha, exporte ou exclua seus dados.",
      },
      { property: "og:title", content: "Minha conta — RUMVIA" },
      { property: "og:description", content: "Gerencie sua conta RUMVIA." },
    ],
  }),
  component: ContaPage,
});

function ContaPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  const perfilForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: profile?.full_name ?? "",
      headline: profile?.headline ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
    },
  });

  const senhaForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  async function salvarPerfil(values: ProfileValues) {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: values.fullName,
        headline: values.headline || null,
        city: values.city || null,
        state: values.state || null,
      })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Perfil atualizado.");
  }

  async function trocarSenha(values: NewPasswordValues) {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast.error(error.message);
      return;
    }
    senhaForm.reset();
    toast.success("Senha alterada.");
  }

  async function exportarDados() {
    if (!user) return;
    setExporting(true);
    try {
      const db = supabase;
      const [perfil, prefs, gapAnalyses, userSkills, studyPlans, userCerts, userCourses] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("user_track_preferences").select("*").eq("user_id", user.id),
          supabase
            .from("gap_analyses")
            .select("id, track_id, seniority, market_segment, adherence_score, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("user_skills")
            .select("skill_id, self_level, years_exp")
            .eq("user_id", user.id),
          db
            .from("study_plans")
            .select("title, status, target_date, created_at")
            .eq("user_id", user.id),
          db
            .from("user_certifications")
            .select("certification_id, custom_name, status, obtained_at, expires_at")
            .eq("user_id", user.id),
          db
            .from("user_courses")
            .select("course_id, custom_title, status, progress_percent, completed_at")
            .eq("user_id", user.id),
        ]);
      const payload = {
        exportado_em: new Date().toISOString(),
        conta: { id: user.id, email: user.email },
        perfil: perfil.data,
        preferencias_de_trilha: prefs.data ?? [],
        analises_de_gap: gapAnalyses.data ?? [],
        skills: userSkills.data ?? [],
        planos_de_estudo: studyPlans.data ?? [],
        certificacoes: userCerts.data ?? [],
        cursos: userCourses.data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rumvia-meus-dados.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function excluirConta() {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteMyAccount();
      await signOut();
      toast.success("Conta excluída.");
      void navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error("Não foi possível excluir a conta agora: " + (err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Configurações" title="Minha conta" subtitle={user?.email ?? undefined} />

      <Blueprint className="p-5">
        <h2 className="label-h6 text-neutral-700">Perfil</h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={perfilForm.handleSubmit(salvarPerfil)}
        >
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nome">
              Nome completo
            </label>
            <Input id="nome" {...perfilForm.register("fullName")} />
            <FieldError message={perfilForm.formState.errors.fullName?.message} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="headline">
              Headline
            </label>
            <Input id="headline" {...perfilForm.register("headline")} />
            <FieldError message={perfilForm.formState.errors.headline?.message} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="cidade">
              Cidade
            </label>
            <Input id="cidade" {...perfilForm.register("city")} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="estado">
              Estado
            </label>
            <Input id="estado" {...perfilForm.register("state")} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={perfilForm.formState.isSubmitting}>
              Salvar perfil
            </Button>
          </div>
        </form>
      </Blueprint>

      <Blueprint className="p-5">
        <h2 className="label-h6 text-neutral-700">Trocar senha</h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={senhaForm.handleSubmit(trocarSenha)}
        >
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova">
              Nova senha
            </label>
            <Input
              id="nova"
              type="password"
              autoComplete="new-password"
              {...senhaForm.register("password")}
            />
            <FieldError message={senhaForm.formState.errors.password?.message} />
          </div>
          <div>
            <label className="label-h6 text-neutral-700" htmlFor="nova2">
              Confirmar nova senha
            </label>
            <Input
              id="nova2"
              type="password"
              autoComplete="new-password"
              {...senhaForm.register("passwordConfirm")}
            />
            <FieldError message={senhaForm.formState.errors.passwordConfirm?.message} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline" loading={senhaForm.formState.isSubmitting}>
              Alterar senha
            </Button>
          </div>
        </form>
      </Blueprint>

      <Blueprint className="p-5">
        <h2 className="label-h6 text-neutral-700">Meus dados</h2>
        <p className="mt-1 text-caption text-neutral-700">
          Baixe uma cópia em JSON com seu perfil e suas preferências de trilha.
        </p>
        <Button className="mt-3" variant="outline" loading={exporting} onClick={exportarDados}>
          Exportar meus dados
        </Button>
      </Blueprint>

      <Blueprint className="border-danger p-5">
        <h2 className="label-h6 text-danger">Excluir conta</h2>
        <p className="mt-1 text-caption text-neutral-700">
          Apaga permanentemente seu perfil, suas análises e os arquivos de currículo armazenados.
          Esta ação não pode ser desfeita. Digite <strong>EXCLUIR</strong> para confirmar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-48"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="EXCLUIR"
            aria-label="Confirmação de exclusão"
          />
          <Button
            variant="destructive"
            disabled={confirmText !== "EXCLUIR"}
            loading={deleting}
            onClick={excluirConta}
          >
            Excluir minha conta
          </Button>
        </div>
      </Blueprint>
    </div>
  );
}
