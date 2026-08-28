import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRecomputeGap } from "@/hooks/use-gap";

/**
 * Busca no catálogo e acrescenta a skill ao perfil.
 *
 * Autossuficiente de propósito: o parser de CV não pega tudo, e a pessoa
 * costuma perceber o que ficou faltando justamente enquanto olha o painel ou o
 * onboarding — não na tela de skills. Por isso este componente carrega o
 * catálogo, sabe o que o usuário já tem e grava sozinho.
 *
 * Grava com level 3 / source "manual", o mesmo que /minhas-skills faz: quem
 * adiciona à mão declara que sabe, e ajusta o nível depois se quiser.
 */

const NIVEL_PADRAO = 3;

export interface AdicionarSkillProps {
  /** Rótulo do botão. */
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "lg" | "default";
  align?: "start" | "end" | "center";
  /** Chamado depois de gravar, para a tela reagir se quiser. */
  onAdicionada?: (skillId: string, nome: string) => void;
}

export function AdicionarSkill({
  label = "Adicionar skill",
  variant = "outline",
  size = "sm",
  align = "end",
  onAdicionada,
}: AdicionarSkillProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const recomputeGap = useRecomputeGap();
  const [open, setOpen] = React.useState(false);

  const catalogo = useQuery({
    queryKey: ["catalogo-skills"],
    // Catálogo muda por curadoria, não por sessão: cache longo.
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [skills, aliases] = await Promise.all([
        supabase.from("skills").select("id, canonical_name").order("canonical_name"),
        supabase.from("skill_aliases").select("skill_id, alias"),
      ]);
      const porSkill = new Map<string, string[]>();
      for (const a of aliases.data ?? []) {
        const lista = porSkill.get(a.skill_id) ?? [];
        lista.push(String(a.alias));
        porSkill.set(a.skill_id, lista);
      }
      return { skills: skills.data ?? [], aliasesPorSkill: porSkill };
    },
  });

  // A chave TEM de ser diferente da usada por /minhas-skills, que é
  // ["user_skills", userId]. O React Query indexa só pela chave: duas queries
  // com a mesma chave dividem a MESMA entrada de cache, e quem resolver
  // primeiro define o valor que as duas enxergam.
  //
  // Esta aqui devolvia um Set e a de /minhas-skills espera um array. Quando
  // este componente populava o cache primeiro, /minhas-skills lia um Set e
  // quebrava com "I.map is not a function" — o `?? []` de lá não protege,
  // porque um Set é truthy. Além disso os SELECTs diferem (aqui só skill_id,
  // lá seis colunas), então compartilhar a entrada entregaria linhas
  // incompletas mesmo com o formato certo.
  //
  // O sufixo "ids" separa as duas entradas mantendo o prefixo ["user_skills"],
  // então invalidateQueries({queryKey:["user_skills"]}) continua alcançando as
  // duas — o React Query casa chave por prefixo de array.
  const minhas = useQuery({
    queryKey: ["user_skills", user?.id, "ids"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("user_skills")
        .select("skill_id")
        .eq("user_id", user!.id);
      // Array, não Set: um valor serializável e do mesmo formato do que a outra
      // query devolve. Se as chaves voltarem a colidir um dia, o resultado é
      // dado errado — não uma tela branca.
      return (data ?? []).map((r) => r.skill_id);
    },
  });

  const adicionar = useMutation({
    mutationFn: async ({ skillId }: { skillId: string; nome: string }) => {
      if (!user) throw new Error("Sessão não encontrada.");
      const { error } = await supabase.from("user_skills").upsert(
        {
          user_id: user.id,
          skill_id: skillId,
          level: NIVEL_PADRAO,
          source: "manual",
          last_used_year: new Date().getFullYear(),
        },
        { onConflict: "user_id,skill_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(`“${v.nome}” adicionada.`);
      void queryClient.invalidateQueries({ queryKey: ["user_skills"] });
      // O gap tem de refazer: a aderência muda ao ganhar uma skill.
      recomputeGap();
      onAdicionada?.(v.skillId, v.nome);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Só o que ainda não está no perfil — reoferecer o que já tem é ruído.
  const disponiveis = React.useMemo(() => {
    const todas = catalogo.data?.skills ?? [];
    const tenho = minhas.data;
    if (!tenho) return todas;
    // O Set é montado aqui, a partir do array do cache. Antes ele vinha pronto
    // da queryFn, e era esse Set que vazava para /minhas-skills pela chave
    // compartilhada.
    const jaTenho = new Set(tenho);
    return todas.filter((s) => !jaTenho.has(s.id));
  }, [catalogo.data, minhas.data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size={size} disabled={!user}>
          <Plus className="mr-1 size-4" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align={align}>
        <Command
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar no catálogo (pt-BR ou inglês)" />
          <CommandList>
            <CommandEmpty>
              {catalogo.isPending ? "Carregando catálogo…" : "Nenhuma skill encontrada."}
            </CommandEmpty>
            <CommandGroup>
              {disponiveis.map((s) => (
                <CommandItem
                  key={s.id}
                  // Aliases entram no value para a busca achar por "k8s", "golang" etc.
                  value={`${s.canonical_name} ${(catalogo.data?.aliasesPorSkill.get(s.id) ?? []).join(" ")}`}
                  onSelect={() => {
                    adicionar.mutate({ skillId: s.id, nome: s.canonical_name });
                    setOpen(false);
                  }}
                >
                  <Check className="mr-2 size-3.5 opacity-0" aria-hidden />
                  {s.canonical_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
