import { Card, Skeleton } from './ui'
import '../AiExperience.css'

export function WorkspaceSkeleton() {
  return (
    <div
      className="workspace-skeleton"
      role="status"
      aria-label="Loading client intelligence"
      aria-busy="true"
    >
      <h1 className="sr-only">Loading client workspace</h1>
      <span className="sr-only">Loading current client records and brief status…</span>
      <Card className="skeleton-heading">
        <Skeleton />
        <Skeleton />
      </Card>
      <div className="skeleton-kpis">
        {[0, 1, 2, 3].map((key) => (
          <Card className="skeleton-kpi" key={key}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </Card>
        ))}
      </div>
      <div className="skeleton-content">
        {[0, 1].map((key) => (
          <Card key={key}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </Card>
        ))}
      </div>
    </div>
  )
}
