import { useQuery } from '@tanstack/react-query'
import { getJson } from './api'
import { parseExecutive } from './executiveContract'
import { Button } from './components/ui'
import './ExecutiveDashboard.css'

const money = (value: number | null) =>
  value == null
    ? 'Not available'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(value)

export function ExecutiveDashboard({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['executive-dashboard', userId],
    queryFn: async ({ signal }) =>
      parseExecutive(await getJson<unknown>('/api/executive-dashboard', signal)),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const data = query.data
  const maximumPremium = Math.max(1, ...(data?.premium_by_line.map((line) => line.premium) ?? []))
  const maximumCommission = Math.max(
    1,
    ...(data?.commission_trend.months.map((month) => month.value) ?? [])
  )
  const carrierGradient = data?.carrier_mix.carriers
    .map((carrier, index, carriers) => {
      const start = carriers.slice(0, index).reduce((total, item) => total + item.percentage, 0)
      return `var(--executive-${carrier.color}) ${start}% ${start + carrier.percentage}%`
    })
    .join(', ')

  return (
    <main className="executive-dashboard" id="main-content" tabIndex={-1}>
      <header className="executive-heading">
        <h1>Executive Dashboard</h1>
        {data && <p>{data.subtitle}</p>}
        <Button disabled={query.isFetching} onClick={() => query.refetch()}>
          {query.isFetching ? 'Refreshing…' : 'Refresh metrics'}
        </Button>
      </header>
      <p className="executive-data-note">
        {data
          ? `${data.metadata.authorized_client_count} authorized clients · ${data.metadata.producer_count} producers · SQLite source records as of ${data.metadata.as_of}`
          : 'Loading authorized SQLite metrics…'}
      </p>
      {query.isPending && (
        <p className="executive-message" role="status">
          Loading executive dashboard…
        </p>
      )}
      {query.isError && (
        <div className="executive-message" role="alert">
          <p>Executive dashboard could not be loaded.</p>
          <button type="button" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {data && (
        <>
          <section className="executive-kpis" aria-label="Agency key performance indicators">
            {data.kpis.map((kpi) => (
              <article className="executive-panel executive-kpi" key={kpi.label}>
                <strong className={`executive-accent-${kpi.color}`}>{kpi.value}</strong>
                <h2>{kpi.label}</h2>
                <p>{kpi.change}</p>
              </article>
            ))}
          </section>
          <div className="executive-grid">
            <section
              className="executive-panel executive-premium"
              aria-labelledby="executive-premium-title"
            >
              <h2 id="executive-premium-title">Premium by Line of Business</h2>
              <div className="executive-premium-bars">
                {data.premium_by_line.map((line) => (
                  <div className="executive-premium-row" key={line.label}>
                    <span>{line.label}</span>
                    <div className="executive-bar-track" aria-hidden="true">
                      <div
                        className={`executive-fill-${line.color}`}
                        style={{ width: `${(line.premium / maximumPremium) * 60}%` }}
                      />
                    </div>
                    <strong>{money(line.premium)}</strong>
                  </div>
                ))}
              </div>
              {!data.premium_by_line.length && (
                <p className="executive-data-note">No accessible active policies.</p>
              )}
            </section>
            <section
              className="executive-panel executive-carriers"
              aria-labelledby="executive-carriers-title"
            >
              <h2 id="executive-carriers-title">Carrier Mix</h2>
              <div className="executive-carrier-content">
                <div
                  className="executive-donut"
                  style={{
                    background: carrierGradient
                      ? `conic-gradient(${carrierGradient})`
                      : 'var(--line)',
                  }}
                  role="img"
                  aria-label={`${data.carrier_mix.total} carriers; distribution shown in adjacent legend`}
                >
                  <div>
                    <strong>{data.carrier_mix.total}</strong>
                    <span>Carriers</span>
                  </div>
                </div>
                <ul className="executive-carrier-legend">
                  {data.carrier_mix.carriers.map((carrier) => (
                    <li key={carrier.name}>
                      <span
                        className={`executive-legend-dot executive-fill-${carrier.color}`}
                        aria-hidden="true"
                      />
                      <span>{carrier.name}</span>
                      <strong>{carrier.percentage}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section
              className="executive-panel executive-commission"
              aria-labelledby="executive-commission-title"
            >
              <h2 id="executive-commission-title">Commission Trend (Monthly)</h2>
              <p className="executive-data-note">{data.commission_trend.period_label}</p>
              <div
                className="executive-months"
                role="img"
                aria-label={`Monthly commission from stored financial records. ${data.commission_trend.period_label}. Average ${money(data.commission_trend.average)}.`}
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, data.commission_trend.months.length)}, minmax(28px, 1fr))`,
                }}
              >
                {data.commission_trend.months.map((month, index) => (
                  <div className="executive-month" key={month.month}>
                    <div className="executive-month-track">
                      <div
                        className={
                          index === data.commission_trend.months.length - 1
                            ? 'executive-fill-blue'
                            : 'executive-fill-green'
                        }
                        style={{ height: `${(month.value / maximumCommission) * 100}%` }}
                      />
                    </div>
                    <span title={`${month.label}: ${money(month.value)}`}>{month.label}</span>
                  </div>
                ))}
              </div>
              <div className="executive-commission-caption">
                <span>
                  {data.commission_trend.latest_label}:{' '}
                  <strong className="executive-accent-blue">
                    {money(data.commission_trend.latest)}
                  </strong>
                </span>
                <span>
                  Period avg: <strong>{money(data.commission_trend.average)}</strong>
                </span>
              </div>
            </section>
            <section
              className="executive-panel executive-producers"
              aria-labelledby="executive-producers-title"
            >
              <h2 id="executive-producers-title">Producers · {data.top_producers.length}</h2>
              <div className="executive-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Producer</th>
                      <th scope="col">Clients</th>
                      <th scope="col">Premium</th>
                      <th scope="col">Retention</th>
                      <th scope="col">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_producers.map((producer, index) => (
                      <tr key={producer.producer_id}>
                        <td>{index + 1}</td>
                        <th scope="row">{producer.name}</th>
                        <td>{producer.client_count}</td>
                        <td>{money(producer.premium)}</td>
                        <td
                          className={
                            producer.retention != null && producer.retention < 90
                              ? 'executive-accent-amber'
                              : 'executive-accent-green'
                          }
                        >
                          {producer.retention == null
                            ? 'Not available'
                            : `${producer.retention.toFixed(1)}%`}
                        </td>
                        <td>{money(producer.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.top_producers.length && (
                <p className="executive-data-note">No producers in your authorized scope.</p>
              )}
            </section>
          </div>
          <section
            className="executive-panel executive-methods"
            aria-label="Metric definitions and scope"
          >
            <h2>Metric definitions and scope</h2>
            <dl>
              {Object.entries(data.metadata.metric_definitions).map(([label, definition]) => (
                <div key={label}>
                  <dt>{label.replaceAll('_', ' ')}</dt>
                  <dd>{definition}</dd>
                </div>
              ))}
            </dl>
            {data.metadata.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
