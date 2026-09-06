import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  vector,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** Perfis de acesso. A ordem importa: cada perfil enxerga o que os anteriores enxergam. */
export const userRole = pgEnum('user_role', [
  'aluno',
  'professor',
  'coordenacao',
  'admin',
]);

/** Segmentos escolares, conforme os filtros das telas oficiais. */
export const segment = pgEnum('segment', [
  'educacao_infantil',
  'fundamental_i',
  'fundamental_ii',
  'ensino_medio',
]);

/** Tipos de documento que a IA classifica automaticamente na ingestão. */
export const documentType = pgEnum('document_type', [
  'autorizacao',
  'bilhete',
  'circular',
  'comunicado',
  'conteudo_avaliacao',
  'convite',
  'cronograma_provas',
  'lista_material',
  'prova',
  'recuperacao',
  'calendario',
  'regulamento',
  'outro',
]);

export const ingestionStatus = pgEnum('ingestion_status', [
  'pending',
  'extracting',
  'classifying',
  'embedding',
  'ready',
  'failed',
]);

export const eventType = pgEnum('event_type', [
  'prova',
  'recuperacao',
  'simulado',
  'evento',
  'entrega',
]);

/** Fila de validação humana para o que a IA extraiu dos documentos. */
export const eventReview = pgEnum('event_review', [
  'a_revisar',
  'ativo',
  'cancelado',
]);

export const messageFeedback = pgEnum('message_feedback', ['util', 'nao_util']);

/* -------------------------------------------------------------------------- */
/*  Tenants — a plataforma é whitelabel e atende mais de uma unidade           */
/* -------------------------------------------------------------------------- */

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  /** Tokens de marca (cores, tipografia, tamanho do logo) editados no Whitelabel. */
  branding: jsonb('branding').$type<Branding>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Identidade visual editável pelo administrador. Todo campo é opcional: o que
 * não estiver definido cai no padrão do tema, então um tenant recém-criado já
 * renderiza correto sem nenhuma configuração.
 */
export interface Branding {
  primary?: string;
  primaryHover?: string;
  primarySoft?: string;
  background?: string;
  surface?: string;
  ink?: string;
  accent?: string;
  /** Chave de um preset tipográfico (ver lib/branding.ts). */
  fontPreset?: string;
  /** Largura do logo na barra lateral, em px. */
  logoSize?: number;
}

/* -------------------------------------------------------------------------- */
/*  Usuários                                                                   */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** A matrícula é o login institucional; o e-mail é o canal dos lembretes. */
    matricula: text('matricula').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: userRole('role').notNull(),
    passwordHash: text('password_hash').notNull(),

    /** Contexto acadêmico — alimenta tanto o filtro de acesso quanto o prompt da IA. */
    segment: segment('segment'),
    serie: text('serie'),
    turma: text('turma'),
    /** Para responsáveis/professores: séries adicionais que a pessoa acompanha. */
    extraSeries: text('extra_series').array().notNull().default(sql`'{}'::text[]`),

    /** Disciplinas que a pessoa leciona. Só afeta o prompt, nunca o acesso. */
    disciplinas: text('disciplinas').array().notNull().default(sql`'{}'::text[]`),
    /** Segmentos em que a pessoa dá aula. */
    segmentsTaught: segment('segments_taught').array().notNull().default(sql`'{}'::segment[]`),
    /**
     * Observação livre mantida pela própria pessoa. Entra no prompt para dar
     * contexto, mas jamais no filtro de acesso — texto livre não pode ampliar
     * permissão.
     */
    contextNote: text('context_note'),
    contextUpdatedAt: timestamp('context_updated_at', { withTimezone: true }),

    active: boolean('active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_tenant_matricula_idx').on(t.tenantId, t.matricula),
    uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Documentos — a base de conhecimento que alimenta a IA                      */
/* -------------------------------------------------------------------------- */

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    /** Nº do comunicado/circular, quando o documento traz um. */
    docNumber: integer('doc_number'),
    type: documentType('type').notNull().default('outro'),
    summary: text('summary'),

    /** Classificação automática. Vazio = vale para toda a escola. */
    segments: segment('segments').array().notNull().default(sql`'{}'::segment[]`),
    series: text('series').array().notNull().default(sql`'{}'::text[]`),
    etapa: text('etapa'),
    anoLetivo: integer('ano_letivo'),

    /** Vigência: fora da janela o documento deixa de ser fonte para a IA. */
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),

    /** Vazio = toda a escola. Caso contrário, restringe por perfil. */
    audience: userRole('audience').array().notNull().default(sql`'{}'::user_role[]`),

    /** Proveniência do arquivo original. */
    sourceKind: text('source_kind').notNull().default('upload'),
    sourceRef: text('source_ref'),
    storagePath: text('storage_path'),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    /** SHA-256 do arquivo: evita reingerir o mesmo documento duas vezes. */
    checksum: text('checksum'),
    pageCount: integer('page_count'),
    /** Verdadeiro quando o texto veio de OCR/visão, e não da camada de texto do PDF. */
    usedOcr: boolean('used_ocr').notNull().default(false),

    status: ingestionStatus('status').notNull().default('pending'),
    statusDetail: text('status_detail'),

    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('documents_tenant_status_idx').on(t.tenantId, t.status),
    index('documents_type_idx').on(t.type),
    index('documents_valid_until_idx').on(t.validUntil),
    uniqueIndex('documents_tenant_checksum_idx').on(t.tenantId, t.checksum),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Chunks vetoriais                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Dimensão fixada em 1536 (text-embedding-3-small). O text-embedding-3-large
 * também entrega 1536 via truncação nativa, então dá para trocar de modelo sem
 * recriar a coluna — mas é obrigatório reindexar o acervo.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    ordinal: integer('ordinal').notNull(),
    page: integer('page'),
    content: text('content').notNull(),
    /** Cabeçalho sintético ("Comunicado 112 · 7º ano") prefixado ao texto antes de embutir. */
    contextHeader: text('context_header'),
    tokenCount: integer('token_count'),

    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chunks_document_idx').on(t.documentId),
    // HNSW: melhor recall/latência que IVFFlat e não exige treino prévio.
    index('chunks_embedding_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Eventos extraídos dos documentos                                           */
/* -------------------------------------------------------------------------- */

export const documentEvents = pgTable(
  'document_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    type: eventType('type').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    /** "14:00" quando o documento informa horário; nulo quando é dia inteiro. */
    startsAtTime: text('starts_at_time'),

    subject: text('subject'),
    /** 1ª ou 2ª chamada, quando aplicável. */
    chamada: integer('chamada'),
    segments: segment('segments').array().notNull().default(sql`'{}'::segment[]`),
    series: text('series').array().notNull().default(sql`'{}'::text[]`),

    /** Fila de validação humana exigida pela especificação. */
    review: eventReview('review').notNull().default('a_revisar'),
    /** Confiança da extração (0–1). Abaixo do limiar o item entra como "a revisar". */
    confidence: text('confidence'),
    /** Trecho literal do documento que originou a data — auditoria da extração. */
    sourceExcerpt: text('source_excerpt'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_tenant_date_idx').on(t.tenantId, t.startsOn),
    index('events_document_idx').on(t.documentId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Conversas                                                                  */
/* -------------------------------------------------------------------------- */

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Nova conversa'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    /** Documentos citados na resposta, já resolvidos para exibição. */
    citations: jsonb('citations')
      .$type<
        Array<{
          documentId: string;
          title: string;
          type: string;
          docNumber: number | null;
          page: number | null;
          excerpt: string;
        }>
      >()
      .notNull()
      .default([]),
    /** Telemetria de custo — alimenta o painel de Relatórios. */
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    latencyMs: integer('latency_ms'),
    model: text('model'),

    /**
     * Consulta autônoma que foi de fato para a busca, depois de resolver
     * follow-ups. Guardada para auditar por que uma resposta saiu ruim.
     */
    searchQuery: text('search_query'),
    /** A resposta foi um pedido de esclarecimento em vez de uma resposta. */
    wasClarification: boolean('was_clarification').notNull().default(false),

    /** Sinal do usuário — alimenta o relatório de lacunas de informação. */
    feedback: messageFeedback('feedback'),
    feedbackNote: text('feedback_note'),
    feedbackAt: timestamp('feedback_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_role_created_idx').on(t.role, t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Auditoria de ingestão                                                      */
/* -------------------------------------------------------------------------- */

export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  status: ingestionStatus('status').notNull().default('pending'),
  /** Passos concluídos, na ordem, para a barra de progresso ao vivo. */
  steps: jsonb('steps')
    .$type<Array<{ step: string; at: string; detail?: string }>>()
    .notNull()
    .default([]),
  error: text('error'),
  startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/*  Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const documentsRelations = relations(documents, ({ many, one }) => ({
  chunks: many(documentChunks),
  events: many(documentEvents),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const documentEventsRelations = relations(documentEvents, ({ one }) => ({
  document: one(documents, {
    fields: [documentEvents.documentId],
    references: [documents.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  messages: many(messages),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type DocumentEvent = typeof documentEvents.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type Segment = (typeof segment.enumValues)[number];
export type DocumentTypeValue = (typeof documentType.enumValues)[number];
