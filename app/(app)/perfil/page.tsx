import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/page-header';
import { ROLE_LABELS, SEGMENT_LABELS, segmentLabel, serieLabel } from '@/lib/taxonomy';
import { currentEtapa, formatToday } from '@/lib/academic-calendar';

export const metadata = { title: 'Meu perfil · Colégio Santa Dorotéia' };
export const dynamic = 'force-dynamic';

/**
 * Transparência, não configuração.
 *
 * A tela mostra exatamente o que o assistente sabe sobre a pessoa. Nada aqui é
 * editável: série e turma recortam quais documentos o aluno enxerga, então
 * deixá-las editáveis pelo próprio usuário seria entregar a chave do cofre. O
 * contexto do professor também é da secretaria, para que a mesma informação
 * valha para o acervo e para a IA.
 */
export default async function ProfilePage() {
  const user = await requireSession();
  const etapa = currentEtapa();
  const isTeacher = user.role !== 'aluno';

  return (
    <>
      <PageHeader area="Meu perfil" subtitle="O que o assistente sabe sobre você" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[46rem] px-10 pb-16 pt-9">
          <p className="eyebrow">Contexto do assistente</p>
          <h1 className="display mt-2 text-[2.5rem]">Como a IA fala com você</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
            É só isto que o assistente sabe a seu respeito. Ele usa esse contexto para escolher o
            tom e para saber quais documentos pode consultar.
          </p>

          <section className="panel mt-8 p-6">
            <p className="eyebrow-muted">Cadastro</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nome" value={user.name} />
              <Field label="Matrícula" value={user.matricula} />
              <Field label="Perfil" value={ROLE_LABELS[user.role]} />
              <Field label="E-mail" value={user.email} />
              {user.role === 'aluno' ? (
                <>
                  <Field label="Série" value={serieLabel(user.serie)} />
                  <Field label="Turma" value={user.turma ?? '—'} />
                  <Field label="Segmento" value={segmentLabel(user.segment)} />
                </>
              ) : null}
            </dl>
          </section>

          {isTeacher && (user.disciplinas.length > 0 || user.seriesTaught.length > 0) ? (
            <section className="panel mt-4 p-6">
              <p className="eyebrow-muted">O que você leciona</p>
              <dl className="mt-4 space-y-4">
                {user.disciplinas.length > 0 ? (
                  <Chips label="Disciplinas" values={user.disciplinas} />
                ) : null}
                {user.seriesTaught.length > 0 ? (
                  <Chips label="Séries" values={user.seriesTaught.map(serieLabel)} />
                ) : null}
                {user.segmentsTaught.length > 0 ? (
                  <Chips
                    label="Segmentos"
                    values={user.segmentsTaught.map((s) => SEGMENT_LABELS[s])}
                  />
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="panel mt-4 p-6">
            <p className="eyebrow-muted">Momento do ano letivo</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Hoje" value={formatToday()} />
              <Field
                label="Etapa vigente"
                value={
                  etapa.emAndamento
                    ? `${etapa.label} de ${etapa.anoLetivo}`
                    : `Fora do período letivo (última: ${etapa.label})`
                }
              />
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[0.75rem] leading-relaxed text-muted">
              O assistente sabe a data e a etapa, então você pode perguntar “a próxima prova” sem
              precisar dizer de qual etapa.
            </p>
          </section>

          <p className="mt-6 rounded-lg bg-chip-soft px-4 py-3.5 text-[0.8125rem] leading-relaxed text-muted">
            {user.role === 'aluno' ? (
              <>
                Estas informações são mantidas pela secretaria e definem quais documentos você
                enxerga — por isso não podem ser alteradas por aqui. A série avança sozinha na
                virada do ano letivo. Se algo estiver errado, fale com a secretaria.
              </>
            ) : (
              <>
                Estas informações são mantidas pela administração do colégio. Se as disciplinas ou
                séries estiverem desatualizadas, peça a correção à coordenação — assim o mesmo
                dado vale para o acervo e para o assistente.
              </>
            )}
          </p>

          {user.concluido ? (
            <p className="mt-4 rounded-lg bg-warning-soft px-4 py-3.5 text-[0.8125rem] leading-relaxed text-warning">
              Pelo avanço automático de ano, este cadastro já passou da última série do Ensino
              Médio. Procure a secretaria para regularizar o acesso.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow-muted">{label}</dt>
      <dd className="mt-1 text-[0.9375rem] text-ink">{value}</dd>
    </div>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="eyebrow-muted">{label}</dt>
      <dd className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="chip">
            {value}
          </span>
        ))}
      </dd>
    </div>
  );
}
