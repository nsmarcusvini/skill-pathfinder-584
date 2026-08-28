import * as React from "react";
import { Link } from "@tanstack/react-router";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Blueprint } from "@/components/rumvia/blueprint";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface CvDropzoneProps {
  /** Recebe o id do CV recém-enviado. */
  onUploaded: (cvId: string) => void;
  className?: string;
}

/**
 * Dropzone pública do funil. O arquivo só é aceito depois do consentimento
 * explícito, e o aceite é gravado em cvs.consent_at.
 */
export function CvDropzone({ onUploaded, className }: CvDropzoneProps) {
  const { user, isAuthenticated, isAnonymous, loading } = useAuth();
  const [consent, setConsent] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const maxSize = (isAuthenticated ? 10 : 5) * 1024 * 1024;
  const bloqueado = !consent || uploading || loading || !user;

  async function upload(file: File) {
    if (!user) {
      toast.error("Preparando sua sessão. Tente novamente em instantes.");
      return;
    }
    if (!consent) {
      toast.error("Marque o consentimento antes de enviar o currículo.");
      return;
    }
    if (file.type !== MIME_PDF && file.type !== MIME_DOCX) {
      toast.error("Envie um arquivo PDF ou DOCX.");
      return;
    }
    if (file.size > maxSize) {
      toast.error(`Arquivo acima do limite de ${Math.round(maxSize / 1024 / 1024)} MB.`);
      return;
    }

    setUploading(true);
    try {
      const cvId = crypto.randomUUID();
      const ext = file.type === MIME_PDF ? "pdf" : "docx";
      const path = `${user.id}/${cvId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("cvs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      if (isAnonymous) {
        // Visitante só pode ter 1 currículo (regra do servidor em
        // parseCv), e essa regra conta TODA linha, não só a is_current.
        // Sem apagar a anterior, o segundo envio de qualquer visitante
        // esbarraria nesse limite — mesmo trocando de arquivo pela
        // primeira vez, o que é uso normal, não abuso.
        const { data: antigos } = await supabase
          .from("cvs")
          .select("storage_path")
          .eq("user_id", user.id);
        if (antigos && antigos.length > 0) {
          await supabase.storage.from("cvs").remove(antigos.map((c) => c.storage_path));
          await supabase.from("cvs").delete().eq("user_id", user.id);
        }
      } else {
        // Conta permanente mantém histórico: só desativa a antiga.
        await supabase
          .from("cvs")
          .update({ is_current: false })
          .eq("user_id", user.id)
          .eq("is_current", true);
      }

      const { error: insertError } = await supabase.from("cvs").insert({
        id: cvId,
        user_id: user.id,
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        is_current: true,
        status: "uploaded",
        consent_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;

      onUploaded(cvId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Blueprint
        className={cn(
          "flex flex-col items-center gap-3 border-dashed p-10 text-center",
          dragging && "bg-neutral-100",
          bloqueado && "opacity-70",
        )}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          if (!bloqueado) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (bloqueado) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-accent-700" aria-hidden />
        ) : (
          <FileUp className="size-6 text-accent-700" aria-hidden />
        )}
        <p className="font-heading text-h4 text-neutral-900">
          Arraste seu currículo em PDF ou DOCX
        </p>
        <p className="text-caption text-neutral-600">
          Até {Math.round(maxSize / 1024 / 1024)} MB. A leitura é automática, por dicionário de
          skills — sem IA generativa.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button size="lg" disabled={bloqueado} onClick={() => inputRef.current?.click()}>
          {uploading ? "Enviando…" : "Selecionar arquivo"}
        </Button>
      </Blueprint>

      <label className="flex items-start gap-2 text-caption text-neutral-700">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--accent-700)]"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Autorizo a leitura automática do meu currículo para gerar a análise.{" "}
          <Link to="/privacidade" className="text-accent-700 underline">
            Como tratamos seus dados
          </Link>
          . Seu CV é apagado em 7 dias se você não criar conta.
        </span>
      </label>
    </div>
  );
}
