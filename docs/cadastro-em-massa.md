# Cadastro em massa de usuários — plano

**Ainda não construído.** Este documento registra a decisão de projeto para que
a implementação depois seja direta, e para que o schema atual já não atrapalhe.

O problema real: no fim de cada ano, a secretaria precisa refletir no sistema
quem entrou, quem saiu, quem mudou de turma e quem repetiu — para ~3.800 alunos
e ~200 professores. Fazer isso um a um não é viável.

---

## A operação é uma reconciliação, não uma importação

A tentação é fazer um "importar CSV" que cria usuários. Isso quebra no segundo
ano: quem já existe vira duplicata, e quem saiu continua com acesso.

O certo é tratar a planilha como o **estado desejado** e o banco como o estado
atual, e calcular a diferença. Para cada linha da planilha e cada usuário do
banco, uma de quatro conclusões:

| Situação | Ação |
|---|---|
| Está na planilha, não está no banco | **Criar** |
| Está nos dois, com dados diferentes | **Atualizar** |
| Está nos dois, idêntico | **Ignorar** |
| Está no banco, não está na planilha | **Desativar** — nunca apagar |

### Por que desativar e não apagar

As conversas, o feedback e a auditoria de ingestão apontam para o usuário. Apagar
uma pessoa levaria junto o histórico de uso da escola — e o `ON DELETE CASCADE`
faria isso em silêncio.

`active = false` já bloqueia o login e é conferido a cada requisição
(`lib/auth/session.ts`), então o efeito prático é o mesmo. O expurgo definitivo,
se for exigido pela LGPD, é uma operação separada e deliberada.

---

## Chave de identidade: a matrícula

A matrícula é única por tenant (`users_tenant_matricula_idx`) e é o que a
secretaria já usa. É por ela que a reconciliação casa as linhas.

O e-mail **não** serve como chave: muda de provedor, tem erro de digitação, e
irmãos às vezes compartilham o do responsável. Mas continua único por tenant —
então a importação precisa detectar e reportar e-mail repetido antes de gravar,
em vez de estourar no meio.

---

## Formato do arquivo

CSV com cabeçalho, separador `;` (o padrão do Excel em português) ou `,`,
detectado automaticamente. Duas colunas de identidade e o resto conforme o papel:

```csv
matricula;nome;email;papel;serie;turma;disciplinas;series_leciona
2027001;Ana Beatriz Souza;ana.souza@aluno.escola.br;aluno;7_ano_fund2;7A;;
2027002;Pedro Henrique Lima;pedro.lima@aluno.escola.br;aluno;1_serie_em;1B;;
P2031;Marina Costa;marina.costa@escola.br;professor;;;Matemática|Física;8_ano_fund2|9_ano_fund2
```

- `serie` e `series_leciona` usam os valores internos de `lib/taxonomy.ts`
  (`7_ano_fund2`), não o rótulo. A tela deve **oferecer o modelo pronto para
  download** com esses valores já nas opções, porque ninguém vai adivinhá-los.
- Listas em uma célula separadas por `|`.
- Campos vazios para o que não se aplica ao papel.

---

## Fluxo na tela

Três passos, e o segundo é o que evita o desastre:

1. **Enviar** o arquivo.
2. **Conferir o plano.** A tela mostra, antes de qualquer gravação: *"142 a
   criar, 3.610 a atualizar, 87 a desativar, 12 linhas com erro"*, com a lista
   das desativações e dos erros. Nada é gravado até a confirmação explícita.
3. **Aplicar**, com relatório do que foi feito.

O passo 2 não é enfeite. Uma planilha exportada com filtro ativo desativaria
metade da escola, e sem a prévia isso só apareceria quando os alunos não
conseguissem entrar.

### Salvaguardas

- Se a planilha desativar **mais de 20%** dos usuários ativos, exigir uma
  confirmação adicional com o número escrito por extenso. É quase sempre erro de
  exportação.
- O administrador que está executando **nunca** é desativado, mesmo que não
  esteja na planilha.
- Aplicar tudo numa transação: ou a planilha inteira entra, ou nenhuma linha.

---

## Senhas

O CSV **não** deve conter senhas — planilha com senha circula por e-mail.

Duas opções, decididas com o colégio:

1. **Senha inicial derivada**, entregue pela secretaria (ex.: os seis primeiros
   dígitos do CPF), com troca obrigatória no primeiro acesso. Exige uma coluna
   `senha_inicial` na tela de conferência, nunca no arquivo.
2. **Convite por e-mail** com link de definição de senha válido por 72 horas.
   Melhor, e é o caminho natural quando a autenticação migrar para o Supabase
   Auth.

Enquanto nenhuma das duas existe, o usuário criado em massa entra sem senha
utilizável e precisa de "Redefinir senha" — que também ainda não existe. **Este
é o pré-requisito real da funcionalidade**, e é por isso que ela não foi feita
junto com a tela de Usuários.

---

## Virada de ano

O avanço de série **já é automático** (`lib/series-progression.ts`): a série é
gravada com o ano letivo em que vale, e a vigente é derivada da data.

Então a planilha do ano seguinte serve para o que o sistema não tem como
adivinhar:

- alunos novos e alunos que saíram;
- **retenções** — o aluno que repetiu precisa da série repetida explicitamente,
  senão avança sozinho;
- mudança de turma;
- mudança de disciplina ou série dos professores.

Quem apenas passou de ano não precisa aparecer na planilha. Mas como a
reconciliação desativa quem está ausente, na prática a planilha precisa conter
**todos os alunos ativos** — o que é justamente o relatório que o sistema
acadêmico da escola exporta.

---

## O que já está pronto no schema

Nada precisa mudar no banco para isto ser construído:

- `users.matricula` único por tenant — a chave de reconciliação;
- `users.active` — a desativação sem perda de histórico;
- `users.serieAnoLetivo` — a retenção é só regravar a série com o ano corrente;
- `users.disciplinas`, `seriesTaught`, `segmentsTaught` — o contexto do professor;
- a validação por papel já existe em `app/actions/users.ts` e pode ser
  reaproveitada linha a linha.

O que falta é a leitura do CSV, o cálculo da diferença, a tela de conferência e
o fluxo de senha.
