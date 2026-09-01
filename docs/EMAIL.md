# E-mail transacional — Supabase Auth + Resend

Todo e-mail que o RUMVIA manda é do **Supabase Auth**, não do app: confirmação de
cadastro, confirmação de troca de e-mail (a que roda na conversão anônimo→permanente),
recuperação de senha e magic link. O app não tem código de envio de e-mail.

Se o SMTP estiver quebrado, **ninguém consegue criar conta** — o `PUT /auth/v1/user`
devolve 500 e a conversão falha inteira. Não é um erro cosmético.

```
RUMVIA (cadastro)
  └─ supabase.auth.updateUser()          src/hooks/use-auth.tsx
       └─ Supabase Auth
            └─ SMTP → smtp.resend.com:465
                 └─ Resend → caixa de entrada
```

---

## Configuração

Painel do Supabase → **Authentication → Emails → SMTP Settings**
(marque *Enable Custom SMTP*).

| Campo | Valor | Cuidado |
|---|---|---|
| Host | `smtp.resend.com` | Só o hostname. **Sem** `https://`, sem barra no fim |
| Port | `465` | 587 também funciona |
| Username | `resend` | Literalmente a palavra `resend` — não é e-mail, não é a API key |
| Password | a API key da Resend (`re_...`) | resend.com/api-keys |
| Sender email | `naoresponda@rumvia.com.br` | O domínio **precisa** estar verificado na Resend |
| Sender name | `RUMVIA` | |

O `Username: resend` é contraintuitivo e foi a causa de um ciclo inteiro de depuração.
Está na [doc da Resend](https://resend.com/docs/send-with-supabase-smtp).

---

## Verificar o domínio na Resend

Sem domínio verificado, a Resend opera em **modo sandbox**: só entrega para o e-mail
dono da conta Resend. Serve para testar, não para produção.

O DNS de `rumvia.com.br` é gerenciado no **GoDaddy** (nameservers `ns47`/`ns48.domaincontrol.com`),
mesmo o site estando na Vercel. Os registros de e-mail vão no GoDaddy, não na hospedagem.

Três registros, obtidos em `GET https://api.resend.com/domains/{id}`:

| Tipo | Nome | Valor |
|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCS...` (chave DKIM completa, vem da API) |
| MX | `send` (prioridade 10) | `feedback-smtp.sa-east-1.amazonses.com` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |

Depois de publicar, clique em **Verify** no painel da Resend — ou via API:

```bash
curl -X POST "https://api.resend.com/domains/{DOMAIN_ID}/verify" \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

O status caminha `not_started` → `pending` → `verified`. **`not_started` significa que a
verificação nunca foi acionada** — publicar o DNS sozinho não basta, alguém precisa
disparar o Verify.

### O SPF que o GoDaddy reescreve

O GoDaddy tem um recurso de *SPF merge* que reescreve o registro publicado. Ao consultar
`send.rumvia.com.br` você vê:

```
v=spf1 include:dc-fd741b8612._spfm.send.rumvia.com.br ~all
```

em vez do `include:amazonses.com` que você digitou. **Isso é esperado e funciona** — a
cadeia resolve para o valor certo:

```bash
dig +short TXT dc-fd741b8612._spfm.send.rumvia.com.br
# "v=spf1 include:amazonses.com ~all"
```

Não tente "consertar" isso; só confirme que a cadeia resolve.

---

> **Estado em 2026-08-31:** `rumvia.com.br` está **verified** na Resend (DKIM, MX e os
> dois SPF). Os registros já estavam publicados no GoDaddy; o que faltava era acionar o
> Verify, que nunca tinha saído de `not_started`.

## Depois de verificar: sair do sandbox

Verificar o domínio **não** troca o remetente sozinho. Volte ao Supabase e mude o
**Sender email** de `onboarding@resend.dev` para um endereço `@rumvia.com.br`.

Enquanto o Sender email for `@resend.dev`, a Resend continua entregando só para o dono da
conta — mesmo com o domínio verificado.

---

## Erros e o que cada um significa

Todos observados de verdade nos `auth_logs` do Supabase. Para investigar:

```sql
select timestamp, event_message from logs
where source = 'auth_logs' and event_message ilike '%"path":"/user"%'
order by timestamp desc limit 10
```

| Erro no log | Causa | Correção |
|---|---|---|
| `dial tcp: address https://...:465: too many colons in address` | Campo **Host** com URL completa em vez de hostname | `smtp.resend.com` |
| `535 "Invalid username"` | **Username** não é `resend` | Username = `resend`, Password = API key |
| `550 "The <dominio> domain is not verified"` | **Sender email** usa domínio não verificado na Resend | `onboarding@resend.dev` (sandbox) ou domínio verificado |
| `550 "You can only send testing emails to your own email address (X)"` | Sandbox: remetente é `@resend.dev` | Verifique o domínio e troque o Sender email |

Repare que os dois últimos são opostos: um reclama do **domínio do remetente**, o outro
do **destinatário**. Se você alternar entre eles, está trocando o Sender email de um lado
para o outro sem verificar o domínio — que é o passo que resolve os dois.

---

## Limite de envio

Com SMTP customizado o Supabase ainda aplica um teto de e-mails por hora
(Authentication → Rate Limits). O padrão é baixo e serve para desenvolvimento; ajuste
antes de abrir para tráfego real, senão cadastros legítimos passam a falhar em pico.
