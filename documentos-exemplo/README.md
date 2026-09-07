# Documentos de exemplo

Dez PDFs fictícios com a forma real de um comunicado escolar — papel timbrado,
número, tipo, destinatário, data de emissão e assinatura. Servem para testar a
ingestão de ponta a ponta antes de subir o acervo verdadeiro.

Nenhum deles repete o acervo do `npm run db:seed`. O pipeline deduplica por
checksum, então um arquivo idêntico seria recusado antes de chegar ao
classificador.

## Como usar

1. Entre como **ADM001** → **Administração** → **Ingestão**.
2. Suba os oito documentos abertos de uma vez, deixando a classificação em
   branco (a IA decide tudo).
3. Para os dois restritos (`261` e `262`), marque **Professor** e
   **Coordenação** em "Quem pode ver estes documentos".
4. Confira o que a IA classificou e as datas que ela extraiu.
5. Entre como **Helena Martins** (aluna do 7º ano) e como **Ricardo Almeida**
   (professor) e compare as respostas.

## O que cada um coloca à prova

| Documento | Dificuldade que exercita |
|---|---|
| **249** — Lista de material 2027 | Ano letivo (2027) diferente do ano de emissão (2026). A IA deve classificar como 2027. |
| **251** — Feira de Ciências | Datas por extenso ("quarta-feira, 21 de outubro"), intervalo de montagem e prazo de entrega. |
| **252** — Semana da Consciência Negra | Cinco eventos em dias seguidos, mais uma exposição com intervalo. Cita uma data passada como referência ("divulgada em 02/09/2026") que **não** pode virar evento. |
| **254** — Provas finais | Tabela com uma matéria por linha; Fundamental II e Ensino Médio no mesmo documento, com horários diferentes. Testa a separação por segmento. |
| **255** — Conteúdos da recuperação | Documento de conteúdo cujas datas de prova estão em **outro** comunicado. A IA não deve inventar datas aqui. |
| **256** — Passeio ao Inhotim | Três prazos distintos (autorização, pagamento, passeio) mais uma data condicional de remarcação. |
| **258** — Matrículas 2027 | Duas janelas de prazo para públicos diferentes; vigência que atravessa a virada do ano. |
| **260** — Formatura | Dois eventos para séries diferentes (9º ano e 3ª série) no mesmo documento, mais ensaios e missa. Testa o recorte por série. |
| **261** — Fechamento de notas | **Restrito ao corpo docente.** O aluno não pode alcançá-lo nem pela listagem, nem pelo chat. |
| **262** — Elaboração das provas finais | Segundo restrito, para confirmar que o recorte vale para mais de um documento. |

## Perguntas para testar depois de subir

**Como aluna do 7º ano (Helena, matrícula 2026074):**

- *Quando são as minhas provas finais?* — deve trazer só o Fundamental II, às 7h10.
- *O que cai na recuperação de matemática?* — deve usar o 255 e não inventar data.
- *Quanto custa o passeio ao Inhotim e até quando pago?* — deve responder que ela **não** vai (é 8º e 9º ano) ou não encontrar; é um bom teste do recorte por série.
- *Quando é o conselho de classe?* — **não** deve responder: é documento restrito.
- *E a de português?* — logo depois da pergunta sobre provas finais, para testar o follow-up.
- *Quando é a prova?* — sem dizer a matéria, para ver se ele pergunta de volta ou assume.

**Como professor (Ricardo, matrícula P1042):**

- *Até quando lanço as notas da 3ª etapa?* — deve achar o 261.
- *Quantas questões discursivas a prova final precisa ter?* — deve achar o 262.
- *Quando é a formatura?* — deve trazer as duas, separadas por série.

## Regerar os PDFs

O conteúdo está em `scripts/documentos-exemplo.ts` e o gerador em
`scripts/gerar-pdfs.ts`. Para mudar ou acrescentar documentos:

```bash
npm i -D playwright        # só para gerar; não é dependência da aplicação
npx tsx scripts/gerar-pdfs.ts
```
