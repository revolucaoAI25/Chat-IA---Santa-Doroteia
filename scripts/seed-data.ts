import type { DocumentTypeValue, Role, Segment } from '@/lib/db/schema';

/**
 * Acervo de demonstração.
 *
 * O conteúdo é fictício, mas imita a forma real dos documentos do colégio —
 * comunicado numerado, tabela de cronograma, lista de conteúdos por matéria —
 * porque é justamente essa forma que o classificador e o extrator de datas
 * precisam saber ler.
 */

export interface SeedEvent {
  title: string;
  type: 'prova' | 'recuperacao' | 'simulado' | 'evento' | 'entrega';
  startsOn: string;
  endsOn?: string | null;
  startsAtTime?: string | null;
  subject?: string | null;
  chamada?: number | null;
  confidence: number;
  sourceExcerpt: string;
}

export interface SeedDocument {
  title: string;
  docNumber: number | null;
  type: DocumentTypeValue;
  summary: string;
  segments: Segment[];
  series: string[];
  etapa: string | null;
  anoLetivo: number;
  validFrom: string | null;
  validUntil: string | null;
  audience: Role[];
  text: string;
  events: SeedEvent[];
}

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    title: 'Cronograma de Avaliações — 3ª Etapa/2026 — Fundamental II',
    docNumber: 231,
    type: 'cronograma_provas',
    summary:
      'Datas, horários e ordem das avaliações da 3ª etapa para o 6º ao 9º ano, com as regras de aplicação.',
    segments: ['fundamental_ii'],
    series: ['6_ano_fund2', '7_ano_fund2', '8_ano_fund2', '9_ano_fund2'],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-08-20',
    validUntil: '2026-12-20',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 231 — Cronograma de Avaliações da 3ª Etapa/2026
Segmento: Fundamental II (6º ao 9º ano)

Senhores pais e responsáveis,

Encaminhamos o cronograma das avaliações da 3ª etapa. As provas serão aplicadas no primeiro horário, com início às 7h10. O aluno que chegar após as 7h30 não terá tempo adicional.

7º ANO
- Matemática — 15/09/2026, às 07:10 — Prova A3
- Português — 17/09/2026, às 07:10 — Prova A3
- Ciências — 22/09/2026, às 07:10 — Prova A3
- História — 24/09/2026, às 07:10 — Prova A3
- Geografia — 29/09/2026, às 07:10 — Prova A3
- Inglês — 01/10/2026, às 07:10 — Prova A3

8º ANO
- Português — 16/09/2026, às 07:10 — Prova A3
- Matemática — 18/09/2026, às 07:10 — Prova A3
- Ciências — 23/09/2026, às 07:10 — Prova A3
- História — 25/09/2026, às 07:10 — Prova A3

9º ANO
- Matemática — 14/09/2026, às 07:10 — Prova A3
- Português — 16/09/2026, às 07:10 — Prova A3
- Física — 21/09/2026, às 07:10 — Prova A3
- Química — 23/09/2026, às 07:10 — Prova A3

ORIENTAÇÕES GERAIS
1. O material de consulta não é permitido, salvo indicação expressa do professor na folha da prova.
2. O uso de celular durante a avaliação implica retirada da prova e nota zero.
3. A calculadora simples é permitida apenas nas avaliações de Física e Química do 9º ano.
4. O aluno deve trazer o material próprio; não haverá empréstimo entre colegas durante a prova.

Belo Horizonte, 24 de agosto de 2026.
Coordenação Pedagógica do Fundamental II`,
    events: [
      { title: 'Prova A3 de Matemática — 7º ano', type: 'prova', startsOn: '2026-09-15', startsAtTime: '07:10', subject: 'Matemática', confidence: 0.96, sourceExcerpt: 'Matemática — 15/09/2026, às 07:10 — Prova A3' },
      { title: 'Prova A3 de Português — 7º ano', type: 'prova', startsOn: '2026-09-17', startsAtTime: '07:10', subject: 'Português', confidence: 0.96, sourceExcerpt: 'Português — 17/09/2026, às 07:10 — Prova A3' },
      { title: 'Prova A3 de Ciências — 7º ano', type: 'prova', startsOn: '2026-09-22', startsAtTime: '07:10', subject: 'Ciências', confidence: 0.95, sourceExcerpt: 'Ciências — 22/09/2026, às 07:10 — Prova A3' },
      { title: 'Prova A3 de História — 7º ano', type: 'prova', startsOn: '2026-09-24', startsAtTime: '07:10', subject: 'História', confidence: 0.95, sourceExcerpt: 'História — 24/09/2026, às 07:10 — Prova A3' },
      { title: 'Prova A3 de Geografia — 7º ano', type: 'prova', startsOn: '2026-09-29', startsAtTime: '07:10', subject: 'Geografia', confidence: 0.95, sourceExcerpt: 'Geografia — 29/09/2026, às 07:10 — Prova A3' },
      { title: 'Prova A3 de Inglês — 7º ano', type: 'prova', startsOn: '2026-10-01', startsAtTime: '07:10', subject: 'Inglês', confidence: 0.94, sourceExcerpt: 'Inglês — 01/10/2026, às 07:10 — Prova A3' },
    ],
  },
  {
    title: 'Conteúdos da Avaliação A3 — 7º ano',
    docNumber: 233,
    type: 'conteudo_avaliacao',
    summary: 'Matéria que cai em cada prova da 3ª etapa do 7º ano, por disciplina.',
    segments: ['fundamental_ii'],
    series: ['7_ano_fund2'],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-08-25',
    validUntil: '2026-10-10',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 233 — Conteúdos da Avaliação A3 — 7º ano — 3ª Etapa/2026

MATEMÁTICA (prova em 15/09/2026)
- Números inteiros: operações, expressões numéricas e problemas.
- Equações do 1º grau com uma incógnita.
- Razão e proporção; regra de três simples.
- Porcentagem aplicada a situações do cotidiano.
- Livro didático: capítulos 7 e 8, exercícios das páginas 132 a 168.

PORTUGUÊS (prova em 17/09/2026)
- Gêneros textuais: crônica e reportagem.
- Classes gramaticais: substantivo, adjetivo e verbo (modo indicativo).
- Concordância verbal e nominal.
- Leitura obrigatória: "O Menino do Dedo Verde", de Maurice Druon.

CIÊNCIAS (prova em 22/09/2026)
- Sistema digestório e sistema respiratório.
- Cadeias e teias alimentares.
- Ecossistemas brasileiros: Cerrado e Mata Atlântica.
- Relatório da atividade prática de laboratório realizada em agosto.

HISTÓRIA (prova em 24/09/2026)
- Brasil Colônia: economia açucareira e mineração.
- Escravidão e formas de resistência; quilombos.
- Inconfidência Mineira.

GEOGRAFIA (prova em 29/09/2026)
- Regionalização do Brasil (IBGE).
- Domínios morfoclimáticos.
- Urbanização brasileira e questões ambientais urbanas.

INGLÊS (prova em 01/10/2026)
- Simple past: regular and irregular verbs.
- Comparatives and superlatives.
- Reading comprehension: unidades 5 e 6 do material.

Coordenação Pedagógica do Fundamental II`,
    events: [],
  },
  {
    title: 'Cronograma e Orientações Gerais da Recuperação — 3ª Etapa/2026',
    docNumber: 240,
    type: 'recuperacao',
    summary:
      'Regras de participação, cálculo da nota e datas das provas de recuperação da 3ª etapa.',
    segments: ['fundamental_i', 'fundamental_ii', 'ensino_medio'],
    series: [],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-09-01',
    validUntil: '2026-11-30',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 240 — Recuperação da 3ª Etapa/2026

QUEM PARTICIPA
Participa da recuperação o aluno que não atingir 60% da pontuação da etapa na disciplina. A convocação é publicada no portal do responsável até 05/10/2026.

CÁLCULO DA NOTA
A nota final da etapa é a MAIOR entre a nota original e a média aritmética entre a nota original e a nota da recuperação. A recuperação nunca reduz a nota já obtida.

DATAS DAS PROVAS DE RECUPERAÇÃO — 3ª ETAPA
- Fundamental I: 19/10/2026 e 20/10/2026, no horário regular de aula.
- Fundamental II: 21/10/2026 e 22/10/2026, das 13h30 às 17h.
- Ensino Médio: 21/10/2026 e 23/10/2026, das 13h30 às 17h.

2ª CHAMADA
O aluno ausente por motivo justificado deve protocolar o requerimento na secretaria em até 48 horas. As provas de 2ª chamada da recuperação ocorrem em 28/10/2026, às 14h, em sala única.

ENTREGA DOS RESULTADOS
Os resultados da recuperação da 3ª etapa são publicados em 06/11/2026 no portal do responsável.

Coordenação Pedagógica`,
    events: [
      { title: 'Recuperação da 3ª etapa — Fundamental I', type: 'recuperacao', startsOn: '2026-10-19', endsOn: '2026-10-20', confidence: 0.93, sourceExcerpt: 'Fundamental I: 19/10/2026 e 20/10/2026, no horário regular de aula.' },
      { title: 'Recuperação da 3ª etapa — Fundamental II', type: 'recuperacao', startsOn: '2026-10-21', endsOn: '2026-10-22', startsAtTime: '13:30', confidence: 0.93, sourceExcerpt: 'Fundamental II: 21/10/2026 e 22/10/2026, das 13h30 às 17h.' },
      { title: 'Recuperação da 3ª etapa — Ensino Médio', type: 'recuperacao', startsOn: '2026-10-21', endsOn: '2026-10-23', startsAtTime: '13:30', confidence: 0.9, sourceExcerpt: 'Ensino Médio: 21/10/2026 e 23/10/2026, das 13h30 às 17h.' },
      { title: 'Provas de 2ª chamada da recuperação', type: 'recuperacao', startsOn: '2026-10-28', startsAtTime: '14:00', chamada: 2, confidence: 0.92, sourceExcerpt: 'As provas de 2ª chamada da recuperação ocorrem em 28/10/2026, às 14h, em sala única.' },
      { title: 'Publicação dos resultados da recuperação', type: 'entrega', startsOn: '2026-11-06', confidence: 0.85, sourceExcerpt: 'Os resultados da recuperação da 3ª etapa são publicados em 06/11/2026.' },
    ],
  },
  {
    title: 'Festa Junina Solidária 2026 — Programação e Convite',
    docNumber: 226,
    type: 'convite',
    summary:
      'Programação, ingressos e regras da Festa Junina Solidária, com a campanha de arrecadação de alimentos.',
    segments: [],
    series: [],
    etapa: null,
    anoLetivo: 2026,
    validFrom: '2026-08-15',
    validUntil: '2026-10-05',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 226 — Festa Junina Solidária 2026

Convidamos toda a comunidade escolar para a nossa Festa Junina Solidária, no pátio central do Colégio.

DATA E HORÁRIO
Sábado, 26 de setembro de 2026, das 15h às 21h.

INGRESSOS
A venda de ingressos ocorre de 08/09/2026 a 18/09/2026, na secretaria, das 7h às 17h.
- Aluno: isento, mediante apresentação da carteirinha.
- Convidado: R$ 20,00 por pessoa.
- Crianças até 5 anos: isentas.

CAMPANHA DA SOLIDARIEDADE
A entrega de doações acontece de 08/09/2026 a 22/09/2026, na portaria do Segmento 1. Cada família é convidada a doar 2 kg de alimento não perecível, exceto sal.

APRESENTAÇÕES
- 15h30 — Quadrilha da Educação Infantil
- 16h30 — Quadrilha do Fundamental I
- 17h30 — Quadrilha do Fundamental II
- 18h30 — Apresentação musical do Ensino Médio
- 19h30 — Quadrilha dos pais e professores

O ensaio geral das quadrilhas do Fundamental II acontece em 23/09/2026, das 14h às 16h, na quadra coberta.

ORIENTAÇÕES
É proibida a entrada com bebida alcoólica. O estacionamento do Colégio ficará reservado a pessoas com mobilidade reduzida.

Direção`,
    events: [
      { title: 'Festa Junina Solidária 2026', type: 'evento', startsOn: '2026-09-26', startsAtTime: '15:00', confidence: 0.97, sourceExcerpt: 'Sábado, 26 de setembro de 2026, das 15h às 21h.' },
      { title: 'Venda de ingressos da Festa Junina', type: 'evento', startsOn: '2026-09-08', endsOn: '2026-09-18', confidence: 0.9, sourceExcerpt: 'A venda de ingressos ocorre de 08/09/2026 a 18/09/2026, na secretaria.' },
      { title: 'Entrega de doações — Campanha da Solidariedade', type: 'entrega', startsOn: '2026-09-08', endsOn: '2026-09-22', confidence: 0.91, sourceExcerpt: 'A entrega de doações acontece de 08/09/2026 a 22/09/2026, na portaria do Segmento 1.' },
      { title: 'Ensaio geral das quadrilhas — Fundamental II', type: 'evento', startsOn: '2026-09-23', startsAtTime: '14:00', confidence: 0.88, sourceExcerpt: 'O ensaio geral das quadrilhas do Fundamental II acontece em 23/09/2026, das 14h às 16h.' },
    ],
  },
  {
    title: 'Atualização do Controle de Acesso e Uso de Uniforme',
    docNumber: 229,
    type: 'circular',
    summary:
      'Novas regras de entrada e saída por catraca biométrica e exigência de uniforme completo.',
    segments: [],
    series: [],
    etapa: null,
    anoLetivo: 2026,
    validFrom: '2026-08-01',
    validUntil: '2027-07-31',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Circular nº 229 — Controle de Acesso e Uniforme

CONTROLE DE ACESSO
A partir de 01/09/2026, a entrada e a saída de alunos passam a ser registradas por catraca biométrica. O responsável recebe notificação automática no aplicativo a cada registro.

- O portão principal abre às 6h40 e a aula começa às 7h10.
- Após as 7h30, a entrada é feita pela secretaria, com registro de atraso.
- A saída antecipada exige autorização do responsável, registrada no aplicativo com no mínimo 2 horas de antecedência.
- Visitantes devem apresentar documento com foto na portaria e receber crachá de identificação.

UNIFORME
O uniforme completo é obrigatório em todos os dias letivos, incluindo dias de prova e de atividade externa.
- Camiseta e agasalho oficiais do Colégio.
- Calça, bermuda ou saia-short oficial.
- Tênis fechado. Não é permitido chinelo, sandália ou crocs.
- Nas aulas de Educação Física, o uniforme esportivo é obrigatório.

O aluno sem uniforme completo terá o registro feito na agenda e o responsável será comunicado. A reincidência acarreta convocação do responsável pela coordenação.

Direção`,
    events: [
      { title: 'Início do controle de acesso por catraca biométrica', type: 'evento', startsOn: '2026-09-01', confidence: 0.86, sourceExcerpt: 'A partir de 01/09/2026, a entrada e a saída de alunos passam a ser registradas por catraca biométrica.' },
    ],
  },
  {
    title: 'Reunião de Pais e Mestres — 3ª Etapa/2026',
    docNumber: 236,
    type: 'comunicado',
    summary: 'Horários da reunião de pais por segmento e regras de atendimento individual.',
    segments: [],
    series: [],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-09-01',
    validUntil: '2026-10-31',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 236 — Reunião de Pais e Mestres da 3ª Etapa

A reunião de pais e mestres da 3ª etapa acontece em 10/10/2026, sábado, no auditório e nas salas de aula.

HORÁRIOS POR SEGMENTO
- Educação Infantil: 8h às 9h30
- Fundamental I: 8h às 10h
- Fundamental II: 9h às 11h
- Ensino Médio: 10h às 12h

ATENDIMENTO INDIVIDUAL COM PROFESSORES
O atendimento individual ocorre das 10h às 12h, nas salas do 2º andar, por ordem de chegada, com até 10 minutos por família.

O agendamento prévio do atendimento individual deve ser feito pelo portal do responsável até 07/10/2026.

A presença do responsável é registrada e considerada no acompanhamento pedagógico do aluno.

Coordenação Pedagógica`,
    events: [
      { title: 'Reunião de Pais e Mestres — 3ª etapa', type: 'evento', startsOn: '2026-10-10', startsAtTime: '08:00', confidence: 0.95, sourceExcerpt: 'A reunião de pais e mestres da 3ª etapa acontece em 10/10/2026, sábado.' },
      { title: 'Prazo para agendar atendimento individual', type: 'entrega', startsOn: '2026-10-07', confidence: 0.89, sourceExcerpt: 'O agendamento prévio do atendimento individual deve ser feito pelo portal do responsável até 07/10/2026.' },
    ],
  },
  {
    title: 'Simulado ENEM 2026 — Ensino Médio',
    docNumber: 238,
    type: 'cronograma_provas',
    summary: 'Datas, estrutura e regras do simulado no formato ENEM para o Ensino Médio.',
    segments: ['ensino_medio'],
    series: ['1_serie_em', '2_serie_em', '3_serie_em'],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-09-01',
    validUntil: '2026-11-15',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 238 — Simulado ENEM 2026

O simulado no formato ENEM será aplicado em dois domingos consecutivos, no prédio principal.

DATAS
- 1º dia: 04/10/2026, das 13h às 18h30 — Linguagens, Códigos e suas Tecnologias; Ciências Humanas; Redação.
- 2º dia: 11/10/2026, das 13h às 18h — Ciências da Natureza; Matemática e suas Tecnologias.

ESTRUTURA
Cada dia contém 90 questões objetivas. A redação do 1º dia segue o modelo dissertativo-argumentativo do ENEM, com tema divulgado no dia da aplicação.

REGRAS
- Os portões fecham às 12h45. Não há tolerância de atraso.
- Documento oficial com foto é obrigatório.
- É permitido apenas caneta esferográfica preta de corpo transparente.
- O aluno só pode deixar a sala após 2 horas do início da prova.

RESULTADO
O boletim individual com o desempenho por área e a nota da redação é entregue em 30/10/2026, no portal do responsável.

Coordenação do Ensino Médio`,
    events: [
      { title: 'Simulado ENEM — 1º dia', type: 'simulado', startsOn: '2026-10-04', startsAtTime: '13:00', confidence: 0.96, sourceExcerpt: '1º dia: 04/10/2026, das 13h às 18h30 — Linguagens, Ciências Humanas e Redação.' },
      { title: 'Simulado ENEM — 2º dia', type: 'simulado', startsOn: '2026-10-11', startsAtTime: '13:00', confidence: 0.96, sourceExcerpt: '2º dia: 11/10/2026, das 13h às 18h — Ciências da Natureza e Matemática.' },
      { title: 'Entrega do boletim do Simulado ENEM', type: 'entrega', startsOn: '2026-10-30', confidence: 0.87, sourceExcerpt: 'O boletim individual é entregue em 30/10/2026, no portal do responsável.' },
    ],
  },
  {
    title: 'Orientações Pedagógicas para o Corpo Docente — 3ª Etapa',
    docNumber: 241,
    type: 'regulamento',
    summary:
      'Prazos internos de lançamento de notas, elaboração de provas e conselho de classe. Documento restrito a professores e coordenação.',
    segments: [],
    series: [],
    etapa: '3ª etapa',
    anoLetivo: 2026,
    validFrom: '2026-08-20',
    validUntil: '2026-12-20',
    // Restrito: é o documento que prova o recorte de acesso por perfil.
    audience: ['professor', 'coordenacao', 'admin'],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado Interno nº 241 — Orientações ao Corpo Docente — 3ª Etapa/2026
DOCUMENTO DE CIRCULAÇÃO INTERNA — NÃO DIVULGAR A ALUNOS E RESPONSÁVEIS

PRAZOS INTERNOS
- Entrega das provas A3 para revisão da coordenação: até 04/09/2026.
- Lançamento das notas da A3 no sistema: até 02/10/2026.
- Entrega das listas de recuperação: até 05/10/2026.
- Lançamento das notas de recuperação: até 04/11/2026.

ELABORAÇÃO DAS AVALIAÇÕES
1. A prova deve conter entre 8 e 12 questões, sendo no mínimo 30% de questões discursivas.
2. O cabeçalho padrão do Colégio é obrigatório, com identificação da etapa e do valor de cada questão.
3. O gabarito comentado deve ser anexado no momento da entrega à coordenação.
4. Questões de múltipla escolha devem ter cinco alternativas.

CONSELHO DE CLASSE
O conselho de classe da 3ª etapa acontece em 12/11/2026, das 13h às 18h, na sala de reuniões. A presença é obrigatória para todos os professores regentes.

ATENDIMENTO A RESPONSÁVEIS
O atendimento individual a responsáveis deve ser agendado pela coordenação. O professor não deve tratar de notas por canais pessoais ou aplicativos de mensagem.

Coordenação Pedagógica`,
    events: [
      { title: 'Prazo: entrega das provas A3 para revisão', type: 'entrega', startsOn: '2026-09-04', confidence: 0.9, sourceExcerpt: 'Entrega das provas A3 para revisão da coordenação: até 04/09/2026.' },
      { title: 'Prazo: lançamento das notas da A3', type: 'entrega', startsOn: '2026-10-02', confidence: 0.9, sourceExcerpt: 'Lançamento das notas da A3 no sistema: até 02/10/2026.' },
      { title: 'Conselho de Classe — 3ª etapa', type: 'evento', startsOn: '2026-11-12', startsAtTime: '13:00', confidence: 0.94, sourceExcerpt: 'O conselho de classe da 3ª etapa acontece em 12/11/2026, das 13h às 18h.' },
    ],
  },
  {
    title: 'Lista de Material Complementar — 2º Semestre — Fundamental I',
    docNumber: 219,
    type: 'lista_material',
    summary: 'Material complementar solicitado para o segundo semestre do Fundamental I.',
    segments: ['fundamental_i'],
    series: ['1_ano_fund1', '2_ano_fund1', '3_ano_fund1', '4_ano_fund1', '5_ano_fund1'],
    etapa: null,
    anoLetivo: 2026,
    validFrom: '2026-07-01',
    validUntil: '2026-12-20',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 219 — Material Complementar do 2º Semestre — Fundamental I

O material abaixo deve ser entregue na secretaria até 05/08/2026, identificado com o nome completo e a turma do aluno.

TODAS AS SÉRIES
- 1 caixa de lápis de cor com 24 unidades
- 2 colas em bastão de 20 g
- 1 tesoura sem ponta identificada
- 1 pasta polionda com elástico, tamanho ofício

1º AO 3º ANO
- 1 caderno de desenho grande, sem pauta
- 1 caixa de giz de cera com 12 unidades
- 1 avental plástico para artes

4º E 5º ANO
- 1 compasso escolar
- 1 transferidor de 180 graus
- 1 caderno quadriculado de 1 cm

O material de uso coletivo é reposto pelo Colégio ao longo do semestre. Não é necessário enviar material de limpeza.

Coordenação do Fundamental I`,
    events: [
      { title: 'Prazo de entrega do material complementar', type: 'entrega', startsOn: '2026-08-05', confidence: 0.88, sourceExcerpt: 'O material abaixo deve ser entregue na secretaria até 05/08/2026.' },
    ],
  },
  {
    title: 'Calendário de Provas — 1ª Etapa/2025 (encerrado)',
    docNumber: 118,
    type: 'cronograma_provas',
    summary:
      'Cronograma da 1ª etapa de 2025. Documento vencido — serve para demonstrar o corte por vigência.',
    segments: ['fundamental_ii'],
    series: ['7_ano_fund2'],
    etapa: '1ª etapa',
    anoLetivo: 2025,
    validFrom: '2025-02-01',
    // Vencido de propósito: a IA não pode usar isto como fonte.
    validUntil: '2025-05-30',
    audience: [],
    text: `COLÉGIO SANTA DOROTÉIA — BELO HORIZONTE
Comunicado nº 118 — Cronograma de Provas da 1ª Etapa/2025 — 7º ano

- Matemática — 10/03/2025, às 07:10
- Português — 12/03/2025, às 07:10
- Ciências — 17/03/2025, às 07:10
- História — 19/03/2025, às 07:10

Este cronograma refere-se ao ano letivo de 2025 e está encerrado.

Coordenação Pedagógica do Fundamental II`,
    events: [],
  },
];
