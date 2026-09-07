# Publicar no Supabase + Vercel

**Você não precisa instalar nada no seu computador.** Tudo é feito pelo
navegador: dois sites, um repositório no GitHub e uma chamada final que a
própria aplicação executa.

Leva cerca de 25 minutos na primeira vez. Faça na ordem — a Parte 2 usa dados
que você copia na Parte 1.

---

## Visão geral

```
1. Supabase  →  cria o banco e o bucket, e você copia 4 valores
2. Vercel    →  importa o repositório e cola esses valores
3. Instalação →  uma chamada cria as tabelas e o seu usuário administrador
4. Fechar    →  remove a chave de instalação
```

---

## Parte 1 — Supabase (o banco e os arquivos)

### 1.1 Criar o projeto

1. Acesse <https://supabase.com> e crie uma conta.
2. Clique em **New project** e preencha:
   - **Name**: `santa-doroteia`
   - **Database Password**: gere uma senha forte e **guarde num lugar seguro**.
     Ela aparece dentro do endereço de conexão e o Supabase não mostra de novo.
   - **Region**: `South America (São Paulo)` — a mais próxima do colégio.
3. Clique em **Create new project** e espere terminar (uns 2 minutos).

### 1.2 Ligar a extensão de busca vetorial

1. Menu lateral → **Database** → **Extensions**.
2. Procure por `vector` e ative.

> É a extensão que permite a busca por significado. Sem ela, a instalação falha
> na Parte 3.

### 1.3 Copiar os dois endereços de conexão

Clique no botão verde **Connect**, no alto da página (ao lado do nome do
projeto). Abre a janela "Connect to your project".

Escolha a aba **Direct Connection string** — a que vem selecionada é a
"Framework", que é outra coisa.

Aparece um bloco **Connection Method** com três opções em bolinha. Elas não
aparecem juntas: você **marca uma e a string embaixo muda**. Por isso este
passo é feito duas vezes.

> Deixe o campo **Type** como `URI` nas duas vezes.

**Primeira vez — o endereço da aplicação:**

1. Marque a bolinha **Transaction pooler**.
2. Role até **Connection string** e clique no ícone de copiar, à direita.
3. Guarde como `DATABASE_URL`. Deve terminar em `:6543/postgres`.

**Segunda vez — o endereço de instalação:**

1. Marque a bolinha **Session pooler**.
2. Copie a string de novo.
3. Guarde como `DATABASE_URL_DIRECT`. Deve terminar em `:5432/postgres`.

Nos dois, troque `[YOUR-PASSWORD]` pela senha do passo 1.1.

> **Se a senha tiver caractere especial** (`@`, `#`, `/`, `?`, `&`…), ela
> precisa ser codificada para caber na URL — a própria tela avisa isso. O jeito
> mais simples de evitar o problema é usar **Reset database password** e gerar
> uma só com letras e números.

**Não use a opção "Direct connection"**, que é a que vem marcada. A própria
tela explica por quê: *"Direct connections use IPv6 by default"*, e a Vercel
não fala IPv6 — a conexão nem se estabelece. É por isso que o Supabase descreve
o Session pooler como *"alternativa à conexão direta em rede IPv4"*: é
exatamente o nosso caso.

Conferência rápida: os dois endereços corretos mudam **só na porta**, têm
`pooler.supabase.com` no host e um ponto no usuário (`postgres.abcdefgh`).

```
postgresql://postgres.abcdefgh:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
postgresql://postgres.abcdefgh:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Se o seu ficou com `db.` no começo do host e o usuário sem ponto
(`postgres:`), você copiou a conexão direta — volte e marque o pooler.

### 1.4 Criar o bucket dos arquivos

1. Menu lateral → **Storage** → **New bucket**.
2. Nome: `documentos`.
3. Deixe **Private** (não marque "Public bucket"). A aplicação serve os PDFs por
   uma rota que confere quem está pedindo; um bucket público deixaria qualquer
   pessoa com o link baixar o arquivo.
4. **Save**.

### 1.5 Copiar as chaves de acesso

**Project Settings** → **API Keys**. Anote:

- **Project URL** — algo como `https://xxxxx.supabase.co`
- **service_role** (na seção *Secret keys*) — uma chave longa começando com `eyJ`

> ⚠️ A `service_role` dá acesso total ao banco. Ela só pode ser colada nas
> variáveis de ambiente da Vercel. Nunca num e-mail, nunca no código.

---

## Parte 2 — Vercel (a aplicação)

### 2.1 Importar o projeto

1. Acesse <https://vercel.com> e entre com a conta do GitHub.
2. **Add New** → **Project**.
3. Escolha o repositório `Chat-IA---Santa-Doroteia`.
4. Em **Branch**, selecione a branch onde está o código.
5. A Vercel reconhece o Next.js sozinha — **não altere** Build Command nem
   Output Directory.

**Ainda não clique em Deploy.** Configure as variáveis primeiro; sem elas o
build falha.

### 2.2 Colar as variáveis de ambiente

Na mesma tela de importação, abra **Environment Variables** e adicione uma por
uma. Marque as três caixas (Production, Preview, Development) em todas.

**Obrigatórias:**

| Nome | O que colar |
|---|---|
| `DATABASE_URL` | o endereço da aplicação — **Transaction pooler**, porta **6543** |
| `DATABASE_URL_DIRECT` | o endereço de instalação — **Session pooler**, porta **5432** |
| `SESSION_SECRET` | uma frase aleatória longa — pode gerar em <https://generate-secret.vercel.app/32> |
| `OPENAI_API_KEY` | sua chave da OpenAI |
| `SUPABASE_URL` | o Project URL do passo 1.5 |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role do passo 1.5 |
| `SUPABASE_STORAGE_BUCKET` | `documentos` |

**Só para a instalação** (você remove depois, na Parte 4):

| Nome | O que colar |
|---|---|
| `SETUP_TOKEN` | uma senha longa que você inventa, com 16+ caracteres. Ex.: `instalacao-santa-doroteia-2026` |
| `SETUP_ADMIN_EMAIL` | seu e-mail |
| `SETUP_ADMIN_PASSWORD` | a senha que você vai usar para entrar (8+ caracteres) |
| `SETUP_ADMIN_NAME` | seu nome |
| `SETUP_SCHOOL_NAME` | `Colégio Santa Dorotéia Belo Horizonte - MG` |

### 2.3 Publicar

Clique em **Deploy**. O primeiro build leva uns 2 minutos. No fim, a Vercel
mostra um endereço `https://alguma-coisa.vercel.app`.

Guarde esse endereço — é o `SEU-ENDERECO` das instruções a seguir.

### 2.4 Escolher o plano

O plano **Hobby** (gratuito) funciona para demonstrar, com um limite real: cada
requisição tem no máximo **60 segundos**. Como a ingestão faz OCR e classificação
dentro da requisição, **PDFs grandes ou digitalizados vão estourar o tempo**.

O plano **Pro** (US$ 20/mês) sobe esse limite para 300 segundos e resolve o uso
normal. Para carregar centenas de PDFs de uma vez, o certo é passar a ingestão
para uma fila — está anotado como próximo passo no README.

---

## Parte 3 — Instalação (uma chamada, pelo navegador)

O banco ainda está vazio: não há tabelas nem usuários. A aplicação cria tudo
sozinha.

Abra o **terminal do seu computador** (no Mac: Spotlight → "Terminal"; no
Windows: menu Iniciar → "PowerShell") e cole a linha abaixo, trocando os dois
valores em maiúsculas:

```bash
curl -X POST "https://SEU-ENDERECO/api/setup?token=SEU_SETUP_TOKEN"
```

> Não é o mesmo que "rodar o projeto localmente" — é só uma chamada ao site, e
> qualquer ferramenta que faça uma requisição POST serve. Se preferir não usar o
> terminal, dá para fazer pelo <https://reqbin.com>: cole a URL completa (com o
> token), escolha o método **POST** e clique em Send.

A resposta esperada:

```json
{
  "ok": true,
  "steps": [
    "4 migração(ões) aplicada(s): ...",
    "Escola criada: Colégio Santa Dorotéia Belo Horizonte - MG",
    "Administrador criado: voce@email.com (matrícula ADM001)"
  ]
}
```

Rodar de novo não faz mal: as migrações são idempotentes e o administrador não é
duplicado nem tem a senha sobrescrita.

### Se der erro

| Resposta | O que fazer |
|---|---|
| `404 Não encontrado` | O `SETUP_TOKEN` não bate, ou a variável não foi salva. Confira na Vercel e **refaça o deploy** — variáveis novas só valem no próximo build. |
| `As migrações precisam de uma conexão em modo sessão` | Faltou a `DATABASE_URL_DIRECT`, ou ela ficou com a porta 6543. Use o **Session pooler**. |
| `connect ENETUNREACH` ou trava sem responder | Você usou a **Direct connection**. No plano gratuito ela é IPv6 e a Vercel não alcança. Troque pelo **Session pooler**. |
| `type "vector" does not exist` | A extensão do passo 1.2 não foi ativada. |
| `password authentication failed` | O `[YOUR-PASSWORD]` continua literal em algum dos endereços. |
| `Faltam SETUP_ADMIN_EMAIL e SETUP_ADMIN_PASSWORD` | O schema foi criado; falta preencher essas duas e chamar de novo. |

---

## Parte 4 — Entrar e fechar a porta

1. Abra `https://SEU-ENDERECO` e entre com a **matrícula `ADM001`** e a senha que
   você definiu em `SETUP_ADMIN_PASSWORD`.
2. Volte na Vercel → **Settings** → **Environment Variables** e **remova**:
   - `SETUP_TOKEN`
   - `SETUP_ADMIN_PASSWORD`
3. Clique em **Redeploy** para as remoções valerem.

Sem o `SETUP_TOKEN`, a rota de instalação deixa de existir — responde 404 para
qualquer um. Esse é o fechamento.

---

## Parte 5 — Configurar o colégio

Com o administrador criado, tudo o mais é pela interface:

1. **Administração → Configurações**
   Ajuste o início do ano letivo e o fim de cada uma das três etapas com o
   calendário oficial. Escreva também as informações gerais (horários,
   unidades, telefone da secretaria) — isso entra no contexto de toda resposta.

2. **Administração → Whitelabel**
   Suba o logo oficial e ajuste as cores.

3. **Administração → Usuários**
   Por ora, cadastre manualmente alguns usuários de teste. O cadastro em massa
   por planilha está no plano (ver README).

4. **Administração → Ingestão**
   Suba os PDFs. Para testar antes do acervo real, use os dez documentos
   fictícios em [`documentos-exemplo/`](./documentos-exemplo/) — o README de lá
   diz o que perguntar depois.

---

## Domínio próprio

**Project Settings** → **Domains** → **Add**. No painel do seu provedor de DNS:

- subdomínio (`assistente.santadoroteia.com.br`): registro **CNAME** apontando
  para `cname.vercel-dns.com`
- domínio raiz: registro **A** apontando para o IP que a Vercel mostrar

O HTTPS é emitido automaticamente depois que o DNS propaga (pode levar algumas
horas).

---

## Depois de publicar

- **Limite de gastos na OpenAI.** Em
  <https://platform.openai.com/settings/organization/limits>, defina um teto
  mensal. É a proteção mais simples contra uma surpresa na fatura.
- **Backups.** O Supabase Pro faz backup diário automático. No plano gratuito
  não há — vale contratar antes de o acervo virar o oficial da escola.
- **Onde ver erros.** Aba **Logs** na Vercel (erros da aplicação) e **Logs** no
  Supabase (consultas lentas).
- **Senhas.** Cada pessoa cadastrada recebe uma senha definida no cadastro.
  Troque a sua depois do primeiro acesso.

---

## Alternativa: aplicar o schema pelo Supabase

Se a Parte 3 falhar por qualquer motivo, dá para criar as tabelas à mão:

1. Supabase → **SQL Editor** → **New query**.
2. Abra os arquivos de `drizzle/` no GitHub, **na ordem numérica**
   (`0000_…`, `0001_…`, `0002_…`, `0003_…`).
3. Copie o conteúdo de cada um, cole no editor e clique em **Run** — um de cada
   vez.

Depois disso, chame a rota de instalação de novo: ela vai pular as tabelas que
já existem e criar só o administrador.
