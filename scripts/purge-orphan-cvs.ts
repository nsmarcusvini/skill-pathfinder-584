/**
 * Remove do Storage os CVs cujo dono não existe mais em `auth.users`.
 *
 *   bun run scripts/purge-orphan-cvs.ts          # simula
 *   bun run scripts/purge-orphan-cvs.ts --apply  # apaga
 *
 * POR QUE ISSO EXISTE
 * `purge_inactive_anonymous()` (cron diário) apaga o usuário anônimo depois de
 * 7 dias com `DELETE FROM auth.users`. As tabelas caem em cascata — inclusive
 * `cvs` — mas **o arquivo no bucket não cai**: Storage não tem FK para
 * `auth.users`. Resultado: todo visitante que enviou currículo e não criou
 * conta deixa o PDF no bucket para sempre.
 *
 * Isso contraria o que a landing promete ("Seu CV é apagado em 7 dias se você
 * não criar conta") e é dado pessoal sem dono parado em produção.
 *
 * `deleteMyAccount` (exclusão a pedido, LGPD) já faz a limpeza certa — o furo é
 * só do caminho automático.
 *
 * POR QUE UM SCRIPT E NÃO SQL NO CRON
 * O cron é SQL puro, e SQL não fala com a API de Storage. Dava para apagar as
 * linhas de `storage.objects` na marra, mas isso remove só o metadado e deixa o
 * blob órfão no backend — pior que o problema original, porque some da
 * auditoria. A API de Storage apaga os dois.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "cvs";
const APPLY = process.argv.includes("--apply");

// Dono é a primeira pasta do caminho: `<user_id>/<arquivo>` — mesma convenção
// das policies de storage (`(storage.foldername(name))[1] = auth.uid()`).
const { data: orfaos, error } = await supabaseAdmin.rpc("list_orphan_cv_objects");

if (error) {
  console.error(`Erro consultando órfãos: ${error.message}`);
  process.exit(1);
}

const caminhos = (orfaos ?? []).map((o: { path: string }) => o.path);

if (caminhos.length === 0) {
  console.log("Nenhum CV órfão. Bucket limpo.");
  process.exit(0);
}

console.log(`${caminhos.length} CV(s) órfão(s) no bucket "${BUCKET}":\n`);
for (const p of caminhos) console.log(`  ${p}`);

if (!APPLY) {
  console.log(`\nSimulação. Rode com --apply para apagar.`);
  process.exit(0);
}

// Em lotes: a API aceita várias chaves por chamada, mas uma lista enorme numa
// requisição só falha por inteiro se um caminho for inválido.
const LOTE = 50;
let apagados = 0;

for (let i = 0; i < caminhos.length; i += LOTE) {
  const lote = caminhos.slice(i, i + LOTE);
  const { error: rmError } = await supabaseAdmin.storage.from(BUCKET).remove(lote);
  if (rmError) {
    console.error(`\nFalha apagando lote ${i / LOTE + 1}: ${rmError.message}`);
    process.exit(1);
  }
  apagados += lote.length;
}

console.log(`\n✓ ${apagados} arquivo(s) apagado(s).`);
