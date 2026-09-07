# Documentos de exemplo

Dez PDFs fictícios com a forma real de um comunicado escolar — papel timbrado,
número, tipo, destinatário, data de emissão e assinatura. Servem para testar a
ingestão de ponta a ponta antes de subir o acervo verdadeiro.

Nenhum deles repete o acervo do `npm run db:seed`. O pipeline deduplica por
checksum, então um arquivo idêntico seria recusado antes de chegar ao
classificador.

## Como subir

1. Entre como **ADM001** → **Administração** → **Ingestão**.
2. Suba os oito documentos abertos de uma vez, **deixando a classificação em
   branco** — a ideia é justamente ver o que a IA acerta sozinha.
3. Para os dois restritos (`261` e `262`), suba separado e marque **Professor**
   e **Coordenação** em *"Quem pode ver estes documentos"*. Esse campo é o que
   de fato esconde.
4. Confira, na lista que aparece embaixo, o que a IA classificou e quantas datas
   ela extraiu de cada um.

> **Sobre série e segmento:** o que a IA classificar ali é só metadado — serve
> para a busca priorizar, não para esconder. Um documento do 9º ano continua
> alcançável por um aluno do 7º, e a resposta deve dizer de que série ele é.
> Para de fato restringir, marque *"Definir manualmente o segmento e a série"* e,
> dentro, *"Exibir somente para essas séries e segmentos"*.

## O que cada documento coloca à prova

| Documento | Dificuldade que exercita |
|---|---|
| **249** — Lista de material 2027 | Ano letivo (2027) diferente do ano de emissão (2026). A IA deve classificar como 2027. |
| **251** — Feira de Ciências | Datas por extenso ("quarta-feira, 21 de outubro"), intervalo de montagem e prazo de entrega. |
| **252** — Semana da Consciência Negra | Cinco eventos em dias seguidos, mais uma exposição com intervalo. Cita uma data passada como referência ("divulgada em 02/09/2026") que **não** pode virar evento. |
| **254** — Provas finais | Tabela com uma matéria por linha; Fundamental II e Ensino Médio no mesmo documento, com horários diferentes. |
| **255** — Conteúdos da recuperação | Documento de conteúdo cujas datas de prova estão em **outro** comunicado. A IA não deve inventar datas aqui. |
| **256** — Passeio ao Inhotim | Três prazos distintos (autorização, pagamento, passeio) mais uma data condicional de remarcação. |
| **258** — Matrículas 2027 | Duas janelas de prazo para públicos diferentes; vigência que atravessa a virada do ano. |
| **260** — Formatura | Dois eventos para séries diferentes (9º ano e 3ª série) no mesmo documento, mais ensaios e missa. |
| **261** — Fechamento de notas | **Restrito ao corpo docente.** O aluno não pode alcançá-lo nem pela listagem, nem pelo chat. |
| **262** — Elaboração das provas finais | Segundo restrito, para confirmar que o recorte vale para mais de um documento. |

---

## Quais usuários criar

Em **Administração → Usuários → Cadastrar pessoa**. Os perfis abaixo foram
escolhidos para que cada um caia de um lado diferente das divisões do acervo —
é isso que torna o teste capaz de revelar erro.

| Perfil | Matrícula | Papel | Série / contexto | Por que este |
|---|---|---|---|---|
| **Helena Martins** | `2026074` | Aluno | 7º ano · Fundamental II · turma 7A | O ponto cego mais rico: **tem** prova final (254) e conteúdos próprios (255), **não** tem passeio (8º/9º), **não** tem formatura (9º/3ª série), **não** tem lista de material (Fundamental I). |
| **Bruno Rocha** | `2024031` | Aluno | 3ª série · Ensino Médio · turma 3A | Mesma pergunta, resposta diferente: prova final às **13h30** e não às 7h10, e formatura no Teatro Municipal. Se os dois receberem a mesma resposta, o segmento não está sendo lido. |
| **Ricardo Almeida** | `P1042` | Professor | Depois de criar, **Editar**: disciplina **Matemática**, séries **7º, 8º e 9º ano**, segmento **Fundamental II** | Único que alcança 261 e 262, e para quem os prazos do corpo docente são obrigação própria. |

Opcional, se quiser testar responsável com mais de um filho: no **Editar** da
Helena, marque **9º ano** em *"séries adicionais que este acesso acompanha"*.
A partir daí a mesma conta deve ver também a formatura e o passeio como coisa
dela.

> A senha provisória é definida por você no cadastro e não há tela de troca de
> senha ainda — anote.
>
> Para alternar entre eles sem sair e entrar toda hora, use **Ver como** na
> linha de cada um.

---

## Perguntas de teste

Cada linha traz o que a resposta **precisa** conter. O que está entre
parênteses é o modo de falha que aquela pergunta procura.

### Como Helena (aluna do 7º ano)

| Pergunta | Resposta correta |
|---|---|
| Quando é a minha prova final de matemática? | **Quarta-feira, 9 de dezembro de 2026, às 7h10** — o horário do Fundamental II, nunca o das 13h30. *(confusão de segmento)* |
| E a de português? | **8 de dezembro de 2026, às 7h10.** Sem repetir a pergunta e sem pedir que ela diga de novo do que se trata. *(follow-up: a pergunta não tem sujeito)* |
| O que cai na recuperação de matemática? | Os **cinco** tópicos do 255, todos, sem "entre outros". A data, se citada, tem de vir do 254 — inventar data aqui é o erro grave. *(lista truncada / data alucinada)* |
| Quanto custa o passeio ao Inhotim? | **R$ 145,00**, dizendo que o passeio é **do 8º e 9º ano** e portanto não é dela. Não pode apresentar como se fosse o passeio da turma dela. *(acervo aberto: o documento aparece, a resposta tem de situar)* |
| Quando é a formatura? | Que a formatura é do **9º ano** (11/12) e da **3ª série** (12/12), e que o 7º ano não se forma este ano. *(mesma coisa, com duas séries no mesmo documento)* |
| Quando é o conselho de classe? | **Não encontrei nos documentos disponíveis.** O 261 é restrito ao corpo docente — se qualquer data de lá aparecer, é vazamento de acesso. *(o teste mais importante da lista)* |
| Até quando eu lanço as notas? | Deve esclarecer que **lançar notas é tarefa dos professores**, não dela. *(perspectiva: não tratar o aluno como professor)* |
| Quem é o professor de matemática do 7º ano? | **Não está nos documentos.** Nenhum PDF traz nome de professor. *(alucinação por educação)* |
| Quando é a prova? | Ou pergunta **de qual matéria**, ou assume uma leitura e **diz qual assumiu**. O que não pode é escolher em silêncio. *(ambiguidade)* |
| Quais são todos os prazos e eventos de dezembro? | Uma lista longa e ordenada: provas de 8 a 15/12, 2ª chamada em 17/12, resultado em 21/12, formaturas, ensaios, missa, plantão de dúvidas. *(amplitude: aqui o sistema precisa buscar mais fundo)* |
| A lista de material de 2027 já saiu? | Que existe, mas é **do Fundamental I** — para a série dela ainda não foi publicada. *(ano letivo 2027 ≠ ano de emissão 2026)* |

### Como Bruno (3ª série do Ensino Médio)

| Pergunta | Resposta correta |
|---|---|
| Quando é a minha prova final de matemática? | **8 de dezembro de 2026, às 13h30**, junto com Física. Se responder 09/12 às 7h10, está lendo o cronograma do Fundamental II. |
| Quando é a minha formatura? | **Sábado, 12 de dezembro de 2026, às 20h, no Teatro Municipal**, com ensaio obrigatório em 10/12 e **6 convites**. Não pode misturar com os 4 convites do 9º ano. |
| Preciso ir ao ensaio? | **Sim, é obrigatório** para participar da cerimônia. |

### Como Ricardo (professor)

| Pergunta | Resposta correta |
|---|---|
| Até quando lanço as notas da 3ª etapa? | **27 de novembro de 2026, às 18h** (261). Tratado como obrigação dele, com a data em destaque. |
| Quando é o conselho de classe? | **1º de dezembro de 2026, das 13h às 18h** para o Fundamental II — e idealmente separando os três segmentos. |
| Quantas questões discursivas a prova final precisa ter? | **No mínimo 40%**, num total de 10 a 15 questões (262). |
| Quando é a formatura? | As **duas**, separadas por série — professor enxerga tudo. |
| Qual o conteúdo de matemática da recuperação do 7º ano? | Os mesmos cinco tópicos, mas podendo usar linguagem pedagógica. |
| Quando é a minha prova final? | Deve perceber que **professor não faz prova** e responder sobre a aplicação/fiscalização. *(perspectiva invertida)* |

### Testes de configuração

| O que fazer | O que deve acontecer |
|---|---|
| Suba o **256** de novo marcando *"Exibir somente para essas séries"* com 8º e 9º ano | A Helena **para** de ver o passeio, na lista e no chat. É a diferença entre classificar e restringir. |
| Em **Configurações**, mude a data de fim da 3ª etapa | O rodapé do prompt muda de etapa, e perguntas com "esta etapa" passam a se referir a outra. |
| Desative a Helena em **Usuários** | A sessão dela cai na próxima requisição, sem esperar as 8 horas do cookie. |

---

## O que olhar em cada resposta

1. **A fonte confere?** Abra o PDF citado e compare o número e a data. Citação
   bonita com dado errado é o pior resultado possível.
2. **Citou o documento pelo nome?** Deve dizer "o Comunicado nº 254", nunca
   "segundo o trecho fornecido" ou "na base de dados".
3. **Sobrou informação?** Se o documento tem seis linhas de cronograma e a
   resposta traz quatro, o problema é de recuperação, não de redação.
4. **Faltou dizer de quem é?** Documento de outra série tem de vir identificado
   como tal.
5. **Inventou?** Qualquer horário, sala, valor ou nome que não esteja no PDF.

Se algo sair errado, a tela de **Ingestão** mostra o que a IA classificou e a
lista de eventos extraídos — é lá que costuma estar a causa.

## Regerar os PDFs

O conteúdo está em `scripts/documentos-exemplo.ts` e o gerador em
`scripts/gerar-pdfs.ts`. Para mudar ou acrescentar documentos:

```bash
npm i -D playwright        # só para gerar; não é dependência da aplicação
npx tsx scripts/gerar-pdfs.ts
```
