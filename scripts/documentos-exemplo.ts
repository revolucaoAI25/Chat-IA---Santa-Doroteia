/**
 * Acervo fictício para testar a ingestão.
 *
 * Os textos imitam a forma real dos documentos de um colégio brasileiro, e
 * cada um exercita uma dificuldade diferente da extração de datas:
 * intervalo, data por extenso, tabela com várias matérias por linha, prazo
 * ("até dia X"), data de emissão que NÃO pode virar evento, e documento
 * restrito ao corpo docente.
 *
 * Nenhum deles repete o acervo do seed: o pipeline deduplica por checksum, e
 * um arquivo idêntico seria recusado antes de chegar ao classificador.
 */

export interface DocumentoExemplo {
  /** Nome do arquivo, sem extensão. */
  slug: string;
  numero: number;
  tipo: string;
  titulo: string;
  destinatario: string;
  /** Data de emissão — a armadilha: não é um evento. */
  emitidoEm: string;
  assinatura: string;
  /** Restrito ao corpo docente: serve para testar o recorte de acesso. */
  restrito?: boolean;
  /** O que este documento coloca à prova. */
  testa: string;
  corpo: string;
}

export const DOCUMENTOS_EXEMPLO: DocumentoExemplo[] = [
  {
    slug: '249-lista-material-2027-fundamental-i',
    numero: 249,
    tipo: 'Lista de material',
    titulo: 'Lista de Material — 2027 — Fundamental I',
    destinatario: 'Fundamental I · 1º ao 5º ano · Ano letivo 2027',
    emitidoEm: '14 de setembro de 2026',
    assinatura: 'Coordenação do Fundamental I',
    testa: 'Ano letivo diferente do ano do documento; prazo de entrega como único evento.',
    corpo: `Senhores pais e responsáveis,

Encaminhamos a lista de material para o ano letivo de 2027. O material deve ser entregue na secretaria entre 26/01/2027 e 30/01/2027, das 8h às 16h, identificado com o nome completo e a série do aluno.

MATERIAL COMUM A TODAS AS SÉRIES
- 1 caixa de lápis de cor com 24 unidades
- 2 colas em bastão de 20 g
- 1 tesoura sem ponta, identificada
- 1 pasta polionda com elástico, tamanho ofício
- 1 garrafa de água identificada, de uso individual

1º AO 3º ANO
- 1 caderno de desenho grande, sem pauta
- 1 caixa de giz de cera com 12 unidades
- 1 avental plástico para as aulas de Arte

4º E 5º ANO
- 1 compasso escolar
- 1 transferidor de 180 graus
- 1 caderno quadriculado de 1 cm
- 1 dicionário de língua portuguesa

O material de uso coletivo é reposto pelo Colégio ao longo do ano. Não é necessário enviar material de limpeza.

A reunião de apresentação do ano letivo acontece no dia 5 de fevereiro de 2027, às 19h, no auditório.`,
  },

  {
    slug: '251-feira-de-ciencias-fundamental-ii',
    numero: 251,
    tipo: 'Comunicado',
    titulo: 'Feira de Ciências 2026 — Fundamental II',
    destinatario: 'Fundamental II · 6º ao 9º ano',
    emitidoEm: '18 de setembro de 2026',
    assinatura: 'Coordenação Pedagógica do Fundamental II',
    testa: 'Datas por extenso, intervalo de exposição e prazo de entrega do projeto.',
    corpo: `A Feira de Ciências deste ano tem como tema "Água: do Cerrado à torneira" e acontece no ginásio poliesportivo.

ENTREGA DO PROJETO ESCRITO
O trabalho escrito deve ser entregue ao professor de Ciências até quarta-feira, 21 de outubro de 2026. Não haverá prorrogação de prazo.

MONTAGEM DOS ESTANDES
A montagem acontece de 9 a 10 de novembro de 2026, das 13h às 17h.

EXPOSIÇÃO
- Sexta-feira, 13 de novembro de 2026, das 8h às 12h — visitação das turmas
- Sábado, 14 de novembro de 2026, das 9h às 13h — visitação das famílias

PREMIAÇÃO
A divulgação dos trabalhos premiados ocorre em 20/11/2026, às 11h, no pátio central.

CRITÉRIOS DE AVALIAÇÃO
1. Fundamentação científica do problema investigado — 30%
2. Metodologia e registro dos dados — 30%
3. Clareza da apresentação oral — 20%
4. Qualidade do material expositivo — 20%

O trabalho vale 20 pontos na 3ª etapa da disciplina de Ciências. A ausência injustificada na exposição implica perda integral da pontuação.`,
  },

  {
    slug: '252-semana-da-consciencia-negra',
    numero: 252,
    tipo: 'Circular',
    titulo: 'Semana da Consciência Negra — Programação',
    destinatario: 'Toda a escola',
    emitidoEm: '25 de setembro de 2026',
    assinatura: 'Direção',
    testa: 'Vários eventos curtos em dias distintos; documento sem recorte de série.',
    corpo: `Entre os dias 16 e 20 de novembro de 2026, o Colégio realiza a Semana da Consciência Negra, com atividades em todos os segmentos.

PROGRAMAÇÃO
- Segunda-feira, 16/11/2026, às 8h — Abertura e apresentação do Coral do Colégio, no auditório.
- Terça-feira, 17/11/2026, às 14h — Roda de conversa com escritoras mineiras, para o Ensino Médio.
- Quarta-feira, 18/11/2026, às 9h — Oficina de percussão para o Fundamental I, na quadra coberta.
- Quinta-feira, 19/11/2026, às 10h — Exibição e debate do documentário selecionado pelo 9º ano.
- Sexta-feira, 20/11/2026, às 8h — Feriado municipal. Não haverá aula.

MOSTRA DE TRABALHOS
Os trabalhos produzidos pelas turmas ficam expostos no corredor principal de 16/11/2026 a 27/11/2026.

PARTICIPAÇÃO DAS FAMÍLIAS
As famílias estão convidadas para a abertura, no dia 16, e para a roda de conversa, no dia 17. Não é necessário confirmar presença.

Este comunicado substitui a programação preliminar divulgada em 02/09/2026.`,
  },

  {
    slug: '254-provas-finais-e-recuperacao-final',
    numero: 254,
    tipo: 'Cronograma de provas',
    titulo: 'Provas Finais e Recuperação Final — 2026',
    destinatario: 'Fundamental II e Ensino Médio',
    emitidoEm: '01 de outubro de 2026',
    assinatura: 'Coordenação Pedagógica',
    testa: 'Tabela com matéria e data por linha; regras de aprovação; 2ª chamada.',
    corpo: `Comunicamos o calendário das provas finais e da recuperação final do ano letivo de 2026.

QUEM FAZ PROVA FINAL
O aluno que, somadas as três etapas, não atingir 60% dos pontos na disciplina. A convocação é publicada no portal do responsável em 04/12/2026.

CRONOGRAMA — FUNDAMENTAL II
- Português — 08/12/2026, às 07h10
- Matemática — 09/12/2026, às 07h10
- Ciências — 10/12/2026, às 07h10
- História — 11/12/2026, às 07h10
- Geografia — 14/12/2026, às 07h10
- Inglês — 15/12/2026, às 07h10

CRONOGRAMA — ENSINO MÉDIO
- Matemática e Física — 08/12/2026, às 13h30
- Português e Redação — 09/12/2026, às 13h30
- Química e Biologia — 10/12/2026, às 13h30
- História, Geografia e Filosofia — 11/12/2026, às 13h30

2ª CHAMADA
O aluno ausente por motivo justificado deve protocolar requerimento na secretaria em até 48 horas. As provas de 2ª chamada acontecem em 17/12/2026, às 14h, em sala única.

RESULTADO FINAL
O resultado é publicado em 21/12/2026, no portal do responsável. A média final para aprovação é 60 pontos.

ORIENTAÇÕES
1. A tolerância de entrada é de 20 minutos após o horário de início.
2. É obrigatório o uso de caneta esferográfica azul ou preta.
3. Não é permitido o uso de celular, smartwatch ou fone de ouvido.
4. O aluno só pode deixar a sala após 1 hora do início da prova.`,
  },

  {
    slug: '255-conteudos-recuperacao-final-7-ano',
    numero: 255,
    tipo: 'Conteúdo de avaliação',
    titulo: 'Conteúdos da Recuperação Final — 7º ano',
    destinatario: 'Fundamental II · 7º ano',
    emitidoEm: '02 de outubro de 2026',
    assinatura: 'Coordenação Pedagógica do Fundamental II',
    testa: 'Documento de conteúdo sem evento próprio: as datas citadas remetem a outro comunicado.',
    corpo: `Seguem os conteúdos cobrados na recuperação final do 7º ano. As datas das provas constam no Comunicado nº 254.

MATEMÁTICA
- Números inteiros e racionais: operações e problemas
- Equações do 1º grau
- Razão, proporção e regra de três simples
- Porcentagem e juros simples
- Áreas e perímetros de figuras planas

PORTUGUÊS
- Gêneros textuais: crônica, reportagem e artigo de opinião
- Classes gramaticais: substantivo, adjetivo, verbo e advérbio
- Concordância verbal e nominal
- Interpretação de texto

CIÊNCIAS
- Sistemas digestório, respiratório e circulatório
- Cadeias e teias alimentares
- Ecossistemas brasileiros: Cerrado, Mata Atlântica e Caatinga
- Misturas e separação de misturas

HISTÓRIA
- Brasil Colônia: economia açucareira e mineração
- Escravidão e formas de resistência
- Inconfidência Mineira
- Independência do Brasil

GEOGRAFIA
- Regionalização do Brasil segundo o IBGE
- Domínios morfoclimáticos
- Urbanização e problemas ambientais urbanos
- Fontes de energia no Brasil

INGLÊS
- Simple past e past continuous
- Comparativos e superlativos
- Vocabulário das unidades 5 a 8

O plantão de dúvidas com os professores acontece nos dias 03/12/2026 e 04/12/2026, das 13h30 às 15h30, na sala 12.`,
  },

  {
    slug: '256-passeio-inhotim-8-e-9-ano',
    numero: 256,
    tipo: 'Autorização',
    titulo: 'Passeio Pedagógico ao Instituto Inhotim — 8º e 9º ano',
    destinatario: 'Fundamental II · 8º e 9º ano',
    emitidoEm: '05 de outubro de 2026',
    assinatura: 'Coordenação do Fundamental II',
    testa: 'Prazo de autorização, prazo de pagamento e data do passeio — três eventos distintos.',
    corpo: `O passeio pedagógico ao Instituto Inhotim, em Brumadinho, integra o projeto interdisciplinar de Arte e Geografia.

DATA E HORÁRIOS
Quinta-feira, 12 de novembro de 2026. Saída às 6h30 do estacionamento do Colégio e retorno previsto para as 19h30. O aluno que chegar após as 6h45 não poderá embarcar.

AUTORIZAÇÃO
A autorização assinada pelo responsável deve ser entregue na secretaria até 30/10/2026. Sem a autorização, o aluno permanece no Colégio em atividade alternativa.

VALOR E PAGAMENTO
O valor de R$ 145,00 cobre transporte, ingresso e lanche da manhã. O pagamento pode ser feito até 05/11/2026, pelo boleto disponível no portal do responsável.

O QUE LEVAR
- Uniforme completo do Colégio
- Protetor solar e boné
- Garrafa de água
- Almoço ou dinheiro para o restaurante do parque

NÃO É PERMITIDO
Levar bebida alcoólica, aparelho de som portátil ou objetos de valor. O Colégio não se responsabiliza por perdas.

Em caso de chuva, o passeio é remarcado para 26/11/2026, mantidas as mesmas condições.`,
  },

  {
    slug: '258-matriculas-2027',
    numero: 258,
    tipo: 'Circular',
    titulo: 'Matrículas para o Ano Letivo de 2027',
    destinatario: 'Toda a escola',
    emitidoEm: '08 de outubro de 2026',
    assinatura: 'Secretaria',
    testa: 'Janelas de prazo com públicos diferentes; valores; documento de vigência longa.',
    corpo: `Estão abertas as matrículas para o ano letivo de 2027.

RENOVAÇÃO — ALUNOS JÁ MATRICULADOS
De 13/10/2026 a 14/11/2026, pelo portal do responsável. Após essa data, a vaga não fica garantida.

MATRÍCULAS NOVAS
De 17/11/2026 a 12/12/2026, na secretaria, mediante disponibilidade de vaga.

DOCUMENTOS NECESSÁRIOS
1. Certidão de nascimento do aluno (cópia)
2. Documento de identidade e CPF do responsável financeiro
3. Comprovante de residência atualizado
4. Histórico escolar ou declaração de transferência
5. Carteira de vacinação, para Educação Infantil e Fundamental I

CALENDÁRIO DE 2027
O ano letivo de 2027 começa em 02/02/2027 para todos os segmentos. A reunião de pais de abertura acontece em 05/02/2027, às 19h.

DESCONTOS
O pagamento da anuidade à vista, até 20/12/2026, garante 8% de desconto. O desconto para irmãos permanece em 10% a partir do segundo filho matriculado.

ATENDIMENTO
A secretaria atende de segunda a sexta, das 7h às 17h, e aos sábados, das 8h às 12h, apenas durante o período de matrículas.`,
  },

  {
    slug: '260-formatura-9-ano-e-3-serie',
    numero: 260,
    tipo: 'Convite',
    titulo: 'Formatura do 9º ano e da 3ª série do Ensino Médio',
    destinatario: 'Fundamental II · 9º ano · Ensino Médio · 3ª série',
    emitidoEm: '12 de outubro de 2026',
    assinatura: 'Direção',
    testa: 'Dois eventos com séries diferentes no mesmo documento; ensaio e cerimônia.',
    corpo: `É com alegria que convidamos as famílias para as cerimônias de formatura de 2026.

FORMATURA DO 9º ANO
Sexta-feira, 11 de dezembro de 2026, às 19h30, no auditório do Colégio. Cada formando tem direito a 4 convites.

FORMATURA DA 3ª SÉRIE DO ENSINO MÉDIO
Sábado, 12 de dezembro de 2026, às 20h, no Teatro Municipal. Cada formando tem direito a 6 convites.

ENSAIOS
- 9º ano: 09/12/2026, às 14h, no auditório do Colégio.
- 3ª série: 10/12/2026, às 14h, no Teatro Municipal.

A presença no ensaio é obrigatória para participar da cerimônia.

RETIRADA DE CONVITES
Os convites devem ser retirados na secretaria de 23/11/2026 a 04/12/2026, das 8h às 16h, mediante assinatura do responsável.

TRAJE
Traje social. A beca é fornecida pelo Colégio e deve ser devolvida ao final da cerimônia.

MISSA DE AÇÃO DE GRAÇAS
A missa acontece no domingo, 6 de dezembro de 2026, às 10h, na capela do Colégio, aberta a todas as famílias.`,
  },

  {
    slug: '261-fechamento-de-notas-corpo-docente',
    numero: 261,
    tipo: 'Regulamento',
    titulo: 'Calendário de Fechamento de Notas e Conselho de Classe',
    destinatario: 'Corpo docente e coordenação',
    emitidoEm: '28 de setembro de 2026',
    assinatura: 'Coordenação Pedagógica',
    restrito: true,
    testa: 'Documento restrito: o aluno não pode alcançá-lo nem pelo chat.',
    corpo: `DOCUMENTO DE CIRCULAÇÃO INTERNA — NÃO DIVULGAR A ALUNOS E RESPONSÁVEIS

PRAZOS DA 3ª ETAPA
- Lançamento das notas da 3ª etapa no sistema: até 27/11/2026, às 18h.
- Entrega das listas de alunos em prova final: até 01/12/2026.
- Lançamento das notas da prova final: até 18/12/2026, às 18h.
- Fechamento do diário de classe: até 21/12/2026.

CONSELHOS DE CLASSE
- Educação Infantil e Fundamental I: 30/11/2026, das 13h às 17h.
- Fundamental II: 01/12/2026, das 13h às 18h.
- Ensino Médio: 02/12/2026, das 13h às 18h.

A presença é obrigatória para todos os professores regentes. A ausência deve ser justificada por escrito à coordenação com 48 horas de antecedência.

CRITÉRIOS PARA O CONSELHO
1. O aluno com média entre 55 e 59 pontos é analisado individualmente pelo conselho.
2. A frequência mínima de 75% é condição para aprovação, independentemente da nota.
3. Casos de aluno com laudo devem ser apresentados com o parecer do serviço de orientação.

REUNIÃO DE PLANEJAMENTO DE 2027
A reunião de planejamento acontece de 26/01/2027 a 30/01/2027, das 8h às 12h. A participação conta como carga horária de formação continuada.

RECESSO DOCENTE
O recesso vai de 22/12/2026 a 23/01/2027.`,
  },

  {
    slug: '262-orientacoes-elaboracao-provas-finais',
    numero: 262,
    tipo: 'Regulamento',
    titulo: 'Orientações para Elaboração das Provas Finais',
    destinatario: 'Corpo docente',
    emitidoEm: '30 de setembro de 2026',
    assinatura: 'Coordenação Pedagógica',
    restrito: true,
    testa: 'Segundo documento restrito, com prazo próprio, para conferir o recorte por perfil.',
    corpo: `DOCUMENTO DE CIRCULAÇÃO INTERNA — NÃO DIVULGAR A ALUNOS E RESPONSÁVEIS

ENTREGA PARA REVISÃO
As provas finais devem ser entregues à coordenação até 20/11/2026, em arquivo editável, junto com o gabarito comentado.

ESTRUTURA DA PROVA
1. Entre 10 e 15 questões, com no mínimo 40% de questões discursivas.
2. As questões objetivas devem ter cinco alternativas.
3. O valor de cada questão deve estar indicado no enunciado.
4. A prova deve cobrir as três etapas do ano, com peso maior para os conteúdos estruturantes.
5. O cabeçalho padrão do Colégio é obrigatório.

ACESSIBILIDADE
Para alunos com laudo, a prova adaptada deve ser entregue junto com a versão regular. A ampliação de fonte é feita pela secretaria mediante solicitação até 25/11/2026.

APLICAÇÃO
A escala de fiscalização é divulgada em 02/12/2026. Cada professor fiscaliza no mínimo duas aplicações.

CORREÇÃO
A correção deve ser concluída em até 5 dias úteis após a aplicação. As provas corrigidas ficam arquivadas na coordenação por 12 meses.

REVISÃO DE PROVA
O pedido de revisão feito pelo responsável deve ser respondido pelo professor em até 3 dias úteis, por escrito, com parecer anexado ao processo.`,
  },
];
