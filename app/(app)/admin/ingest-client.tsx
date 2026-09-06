'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertIcon,
  CheckIcon,
  FileIcon,
  SpinnerIcon,
  UploadIcon,
} from '@/components/icons';
import {
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  SEGMENT_LABELS,
  serieLabel,
} from '@/lib/taxonomy';
import type { DocumentTypeValue, Role, Segment } from '@/lib/db/schema';

interface RecentDocument {
  id: string;
  title: string;
  type: DocumentTypeValue;
  docNumber: number | null;
  segments: Segment[];
  series: string[];
  anoLetivo: number | null;
  validUntil: string | null;
  audience: Role[];
  usedOcr: boolean;
  createdAt: string;
  chunkCount: number;
  eventCount: number;
}

interface IngestResult {
  title: string;
  type: DocumentTypeValue;
  segments: Segment[];
  series: string[];
  anoLetivo: number | null;
  validUntil: string | null;
  chunkCount: number;
  eventCount: number;
  eventsNeedingReview: number;
  usedOcr: boolean;
  duplicate: boolean;
}

type JobState =
  | { status: 'queued' }
  | { status: 'running' }
  | { status: 'done'; result: IngestResult }
  | { status: 'error'; message: string };

interface Job {
  id: string;
  fileName: string;
  size: number;
  state: JobState;
}

const AUDIENCES: Role[] = ['aluno', 'professor', 'coordenacao'];

export function IngestClient({
  stats,
  recent,
  demoMode,
  storage,
}: {
  stats: { total: number; vigentes: number; vencidos: number; aVencer: number; pendingReview: number };
  recent: RecentDocument[];
  demoMode: boolean;
  storage: 'supabase' | 'local';
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [audience, setAudience] = useState<Role[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleAudience = (role: Role) =>
    setAudience((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  async function ingest(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);

    const queued: Job[] = files.map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      size: file.size,
      state: { status: 'queued' },
    }));
    setJobs((prev) => [...queued, ...prev]);

    const update = (id: string, state: JobState) =>
      setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, state } : job)));

    // Sequencial e não em paralelo: cada ingestão faz OCR e chamadas de
    // embedding, e disparar tudo de uma vez só encontraria rate limit.
    for (const [index, file] of files.entries()) {
      const job = queued[index];
      update(job.id, { status: 'running' });

      const body = new FormData();
      body.append('file', file);
      for (const role of audience) body.append('audience', role);
      if (validUntil) body.append('validUntil', validUntil);

      try {
        const response = await fetch('/api/ingest', { method: 'POST', body });
        const payload = await response.json();

        if (!response.ok) {
          update(job.id, { status: 'error', message: payload.error ?? 'Falha na ingestão.' });
        } else {
          update(job.id, { status: 'done', result: payload as IngestResult });
        }
      } catch (error) {
        update(job.id, {
          status: 'error',
          message: error instanceof Error ? error.message : 'Erro de rede.',
        });
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[64rem] px-10 pb-16 pt-9">
        <p className="eyebrow">Ingestão ao vivo</p>
        <h1 className="display mt-2 text-[2.5rem]">Suba documentos e veja a IA classificar</h1>
        <p className="mt-3 max-w-[42rem] text-[0.9375rem] leading-relaxed text-muted">
          Cada documento é extraído, categorizado (tipo, segmento, série e ano), fatiado e
          embeddado — e já vira fonte no chat. Datas de provas e eventos são reconhecidas
          automaticamente.
        </p>

        {demoMode ? (
          <p className="mt-6 flex items-start gap-2.5 rounded-lg bg-warning-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Modo demonstração:</strong> sem{' '}
              <code className="font-mono">OPENAI_API_KEY</code>, a classificação usa regras simples,
              não há OCR e a busca é literal. Configure a chave para ver a qualidade real.
            </span>
          </p>
        ) : null}

        {/* Painel do acervo */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Documentos" value={stats.total} />
          <Stat label="Vigentes" value={stats.vigentes} tone="success" />
          <Stat label="A vencer (30d)" value={stats.aVencer} tone="warning" />
          <Stat label="Vencidos" value={stats.vencidos} tone="danger" />
          <Stat label="Eventos a revisar" value={stats.pendingReview} tone="warning" />
        </div>

        {/* Área de envio */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void ingest([...event.dataTransfer.files]);
          }}
          className={`mt-8 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? 'border-navy bg-navy-soft/40' : 'border-line-strong bg-panel'
          }`}
        >
          <UploadIcon className="mx-auto h-7 w-7 text-navy" />
          <p className="mt-3 text-[1rem] font-bold text-navy">
            Arraste os arquivos ou escolha do computador
          </p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            PDF, DOCX, CSV, XLSX, TXT e imagens. Até 32 MB por arquivo.
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.csv,.xlsx,.xlsm,.txt,.md,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            id="file-input"
            onChange={(event) => void ingest([...(event.target.files ?? [])])}
          />
          <label
            htmlFor="file-input"
            className={`btn-primary mt-5 cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            {busy ? 'Ingerindo…' : 'Escolher arquivos'}
          </label>
        </div>

        {/* Configuração do envio */}
        <div className="panel mt-5 p-6">
          <p className="eyebrow-muted">Quem pode ver estes documentos</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AUDIENCES.map((role) => {
              const active = audience.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleAudience(role)}
                  aria-pressed={active}
                  className={`rounded-full border px-4 py-2 text-[0.8125rem] font-semibold transition-colors ${
                    active
                      ? 'border-navy bg-navy text-white'
                      : 'border-line-strong bg-surface text-ink hover:bg-chip-soft'
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
            Sem nenhum marcado, os documentos valem para toda a escola. A série e o segmento saem
            da classificação automática e recortam o acesso dos alunos — inclusive no que a IA
            busca.
          </p>

          <div className="mt-6 max-w-xs">
            <label className="field-label" htmlFor="valid-until">
              Vigência até (opcional)
            </label>
            <input
              id="valid-until"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              className="field"
            />
            <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
              Em branco, a IA deduz a vigência do próprio documento; se não der, vale o padrão de
              12 meses. Depois dessa data o documento deixa de ser fonte para o assistente.
            </p>
          </div>

          {storage === 'local' ? (
            <p className="mt-5 flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Os arquivos originais estão sendo gravados em <code className="font-mono">./storage</code>.
              Para a Vercel, configure <code className="font-mono">SUPABASE_URL</code> e{' '}
              <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>.
            </p>
          ) : null}
        </div>

        {/* Resultado da ingestão */}
        {jobs.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-serif text-[1.5rem] text-ink">Ingestão desta sessão</h2>
            <ul className="mt-4 space-y-3">
              {jobs.map((job) => (
                <li key={job.id} className="card rise p-4">
                  <div className="flex items-start gap-3">
                    <JobIcon state={job.state} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9375rem] font-semibold text-ink">
                        {job.fileName}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-muted">
                        {formatBytes(job.size)}
                        {job.state.status === 'queued' && ' · na fila'}
                        {job.state.status === 'running' &&
                          ' · extraindo, classificando e gerando embeddings…'}
                      </p>

                      {job.state.status === 'error' ? (
                        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[0.8125rem] font-medium text-danger">
                          {job.state.message}
                        </p>
                      ) : null}

                      {job.state.status === 'done' ? (
                        <IngestSummary result={job.state.result} />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Acervo recente */}
        <section className="mt-12">
          <h2 className="font-serif text-[1.5rem] text-ink">Documentos no acervo</h2>
          <p className="mt-1 text-[0.875rem] text-muted">
            Os {recent.length} mais recentes. Tudo aqui já é fonte para o assistente.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {recent.map((doc) => (
              <li key={doc.id} className="card border-t-2 border-t-navy p-4">
                <p className="eyebrow">
                  {DOCUMENT_TYPE_LABELS[doc.type]}
                  {doc.docNumber ? ` · Nº ${doc.docNumber}` : ''}
                </p>
                <p className="mt-1.5 font-serif text-[1.0625rem] leading-snug text-ink">
                  {doc.title}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {doc.segments.map((segment) => (
                    <span key={segment} className="chip">
                      {SEGMENT_LABELS[segment]}
                    </span>
                  ))}
                  {doc.series.slice(0, 3).map((serie) => (
                    <span key={serie} className="chip">
                      {serieLabel(serie)}
                    </span>
                  ))}
                  {doc.series.length > 3 ? (
                    <span className="chip">+{doc.series.length - 3}</span>
                  ) : null}
                  {doc.anoLetivo ? <span className="chip">{doc.anoLetivo}</span> : null}
                  {doc.audience.length > 0 ? (
                    <span className="chip bg-warning-soft text-warning">
                      Restrito: {doc.audience.map((r) => ROLE_LABELS[r]).join(', ')}
                    </span>
                  ) : null}
                  {doc.usedOcr ? <span className="chip">OCR</span> : null}
                </div>

                <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] text-muted">
                  {doc.chunkCount} trecho{doc.chunkCount === 1 ? '' : 's'} · {doc.eventCount} evento
                  {doc.eventCount === 1 ? '' : 's'} ·{' '}
                  {doc.validUntil ? `vigente até ${formatDate(doc.validUntil)}` : 'sem vigência'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function IngestSummary({ result }: { result: IngestResult }) {
  if (result.duplicate) {
    return (
      <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-[0.8125rem] font-medium text-warning">
        Este arquivo já estava no acervo como “{result.title}”. Nada foi duplicado.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-chip-soft p-3.5">
      <p className="eyebrow">
        {DOCUMENT_TYPE_LABELS[result.type]}
        {result.anoLetivo ? ` · ${result.anoLetivo}` : ''}
      </p>
      <p className="mt-1 font-serif text-[1.0625rem] leading-snug text-ink">{result.title}</p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {result.segments.map((segment) => (
          <span key={segment} className="chip">
            {SEGMENT_LABELS[segment]}
          </span>
        ))}
        {result.series.map((serie) => (
          <span key={serie} className="chip">
            {serieLabel(serie)}
          </span>
        ))}
        {result.segments.length === 0 && result.series.length === 0 ? (
          <span className="chip">Toda a escola</span>
        ) : null}
        {result.usedOcr ? <span className="chip">Lido por OCR</span> : null}
      </div>

      <p className="mt-2.5 text-[0.8125rem] text-muted">
        {result.chunkCount} trecho{result.chunkCount === 1 ? '' : 's'} indexado
        {result.chunkCount === 1 ? '' : 's'} · {result.eventCount} data
        {result.eventCount === 1 ? '' : 's'} extraída{result.eventCount === 1 ? '' : 's'}
        {result.eventsNeedingReview > 0
          ? ` (${result.eventsNeedingReview} aguardando conferência humana)`
          : ''}{' '}
        · {result.validUntil ? `vigente até ${formatDate(result.validUntil)}` : 'sem vigência'}
      </p>
    </div>
  );
}

function JobIcon({ state }: { state: JobState }) {
  const shell = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg';
  if (state.status === 'done') {
    return (
      <span className={`${shell} bg-success-soft text-success`}>
        <CheckIcon className="h-4 w-4" />
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span className={`${shell} bg-danger-soft text-danger`}>
        <AlertIcon className="h-4 w-4" />
      </span>
    );
  }
  if (state.status === 'running') {
    return (
      <span className={`${shell} bg-chip text-navy`}>
        <SpinnerIcon className="h-4 w-4 animate-spin" />
      </span>
    );
  }
  return (
    <span className={`${shell} bg-chip-soft text-muted`}>
      <FileIcon className="h-4 w-4" />
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const accent =
    tone === 'success'
      ? 'border-l-success'
      : tone === 'warning'
        ? 'border-l-warning'
        : tone === 'danger'
          ? 'border-l-danger'
          : 'border-l-navy';

  return (
    <div className={`card border-l-[3px] ${accent} px-4 py-3`}>
      <p className="eyebrow-muted">{label}</p>
      <p className="mt-1 font-serif text-[1.75rem] leading-none text-ink">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
