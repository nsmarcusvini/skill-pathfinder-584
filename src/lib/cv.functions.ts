import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Leitura determinística do currículo (equivalente à função parse-cv).
 * Nesta stack o backend do app roda como server function do TanStack Start.
 * Nenhuma chave de API e nenhum serviço externo é usado aqui.
 */
export const parseCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ cvId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const supabase = context.supabase;
    const userId = context.userId;
    const isAnonymous = Boolean((context.claims as { is_anonymous?: boolean }).is_anonymous);

    const parser = await import("./cv-parser.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cv, error: cvError } = await supabase
      .from("cvs")
      .select("*")
      .eq("id", data.cvId)
      .eq("user_id", userId)
      .maybeSingle();
    if (cvError) throw cvError;
    if (!cv) throw new Error("Currículo não encontrado.");

    const fail = async (message: string) => {
      await supabase
        .from("cvs")
        .update({ status: "failed", parse_error: message })
        .eq("id", cv.id);
      return { ok: false as const, error: message };
    };

    if (isAnonymous) {
      if (cv.file_size > 5 * 1024 * 1024) {
        return fail("Sem conta, o limite é de 5 MB por arquivo. Crie sua conta para enviar até 10 MB.");
      }
      const { count } = await supabase
        .from("cvs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((count ?? 0) > 1) {
        return fail("Visitantes podem manter apenas 1 currículo. Crie sua conta para o histórico.");
      }

      const forwarded = getRequestHeader("x-forwarded-for") ?? "";
      const ip = forwarded.split(",")[0]?.trim() || "desconhecido";
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
      const ipHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();

      const { data: limitRow } = await supabaseAdmin
        .from("parse_rate_limits")
        .select("id, count")
        .eq("ip_hash", ipHash)
        .eq("window_start", windowStart)
        .maybeSingle();

      if (limitRow && limitRow.count >= 2) {
        return fail("Limite de 2 leituras por hora atingido. Tente novamente mais tarde.");
      }
      if (limitRow) {
        await supabaseAdmin
          .from("parse_rate_limits")
          .update({ count: limitRow.count + 1 })
          .eq("id", limitRow.id);
      } else {
        await supabaseAdmin
          .from("parse_rate_limits")
          .insert({ ip_hash: ipHash, window_start: windowStart, count: 1 });
      }
    }

    await supabase.from("cvs").update({ status: "parsing", parse_error: null }).eq("id", cv.id);

    try {
      const download = await supabaseAdmin.storage.from("cvs").download(cv.storage_path);
      if (download.error || !download.data) {
        return fail("Não foi possível ler o arquivo enviado.");
      }
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const text = await parser.extractText(bytes, cv.mime_type);
      if (!text || text.replace(/\s/g, "").length < 80) {
        return fail(
          "Não conseguimos extrair texto deste arquivo. Se for um PDF digitalizado, envie uma versão com texto selecionável.",
        );
      }

      const sectioned = parser.sectionize(text);

      const [{ data: skills }, { data: aliases }, { data: variants }, { data: baselines }] =
        await Promise.all([
          supabase.from("skills").select("id, canonical_name, is_ambiguous, match_patterns"),
          supabase.from("skill_aliases").select("skill_id, alias"),
          supabase.from("track_role_variants").select("id, track_id, name, search_terms").eq("is_active", true),
          supabase.from("track_skill_baselines").select("track_id, skill_id, importance"),
        ]);

      const result = parser.matchSkills(
        sectioned,
        (skills ?? []) as Parameters<typeof parser.matchSkills>[1],
        (aliases ?? []).map((a) => ({ skill_id: a.skill_id, alias: String(a.alias) })),
      );

      const matchedIds = result.extracted
        .map((e) => e.skill_id)
        .filter((id): id is string => Boolean(id));

      const detection = parser.detectTrackAndSeniority(
        result.titles,
        matchedIds,
        (variants ?? []) as Parameters<typeof parser.detectTrackAndSeniority>[2],
        (baselines ?? []) as Parameters<typeof parser.detectTrackAndSeniority>[3],
        result.totalYears,
      );

      // Idempotente por cv_id: refaz versão e termos extraídos.
      await supabase.from("cv_extracted_skills").delete().eq("cv_id", cv.id);
      await supabase.from("cv_versions").delete().eq("cv_id", cv.id);

      await supabase.from("cv_versions").insert({
        cv_id: cv.id,
        version: 1,
        extracted_text: text.slice(0, 200_000),
        parsed_json: {
          headline: sectioned.headline.slice(0, 2000),
          secoes: Object.fromEntries(
            Object.entries(sectioned.sections).map(([k, v]) => [k, v.length]),
          ),
          total_anos: result.totalYears,
          skills_detectadas: matchedIds.length,
          alternativas_trilha: detection.alternatives,
          role_variant_id: detection.roleVariantId,
          parser: parser.PARSER_VERSION,
        },
        detected_track_id: detection.trackId,
        detected_seniority: detection.seniority,
        detection_confidence: detection.confidence,
        parser_version: parser.PARSER_VERSION,
      });

      if (result.extracted.length > 0) {
        const rows = result.extracted.map((e) => ({ cv_id: cv.id, ...e }));
        const { error: insertError } = await supabase.from("cv_extracted_skills").insert(rows);
        if (insertError) throw insertError;
      }

      await supabase.from("cvs").update({ status: "parsed", parse_error: null }).eq("id", cv.id);

      return {
        ok: true as const,
        detectedTrackId: detection.trackId,
        detectedSeniority: detection.seniority,
        confidence: detection.confidence,
        totalSkills: result.extracted.length,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return fail((err as Error).message.slice(0, 500));
    }
  });

/**
 * Apaga TODOS os currículos desta sessão anônima (arquivo + linha) para
 * destravar um novo envio.
 *
 * Existe porque o limite de "1 currículo" para visitante conta toda linha em
 * `cvs`, não só a `is_current`. Duas situações enchem essa contagem sem o
 * visitante ter feito nada de errado: trocar de arquivo (a linha antiga vira
 * `is_current=false`, mas continua existindo) e uma leitura que falha (fica
 * como `status=failed`, ocupando a única vaga). Nos dois casos a pessoa ficava
 * travada sem conseguir tentar de novo, mesmo a página prometendo "sem
 * cadastro para a prévia". Isso é o botão de escape: zera a sessão e libera
 * o próximo envio.
 *
 * Só atua em sessão anônima — conta permanente pode acumular currículos de
 * propósito (é o histórico que a regra vende como diferencial), então nunca
 * apaga em massa por engano.
 */
export const resetVisitorCvs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const isAnonymous = Boolean((context.claims as { is_anonymous?: boolean }).is_anonymous);

    if (!isAnonymous) {
      throw new Error("Conta permanente mantém histórico de currículos — nada foi apagado.");
    }

    const { data: cvs, error: listError } = await supabase
      .from("cvs")
      .select("id, storage_path")
      .eq("user_id", userId);
    if (listError) throw listError;
    if (!cvs || cvs.length === 0) return { ok: true as const, deleted: 0 };

    const paths = cvs.map((c) => c.storage_path);
    // O arquivo some primeiro: se a linha saísse antes e o storage falhasse,
    // sobraria um arquivo órfão sem dono capaz de apagá-lo depois.
    const { error: storageError } = await supabase.storage.from("cvs").remove(paths);
    if (storageError) throw storageError;

    const { error: deleteError } = await supabase.from("cvs").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;

    return { ok: true as const, deleted: cvs.length };
  });
