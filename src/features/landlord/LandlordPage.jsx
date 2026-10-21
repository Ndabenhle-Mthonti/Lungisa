import { useQuery } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import { useAuth } from '../auth/AuthProvider.jsx'
import { fetchLandlordStats } from './api.js'
import JobsTable from './JobsTable.jsx'
import LandlordShell from './LandlordShell.jsx'
import './LandlordPage.css'

export default function LandlordPage() {
  const { session } = useAuth()
  const stats = useQuery({
    queryKey: ['landlord-stats', session?.user?.id],
    queryFn: fetchLandlordStats,
  })

  return (
    <LandlordShell>
      <div className="landlord-dashboard">
        <h1>Dashboard</h1>
        <section
          className="landlord-stats"
          aria-label="Job counts"
          aria-busy={stats.isPending ? 'true' : 'false'}
        >
          {stats.isPending ? (
            <>
              <p className="visually-hidden">Loading job counts.</p>
              <span className="landlord-stat-skeleton" aria-hidden="true" />
              <span className="landlord-stat-skeleton" aria-hidden="true" />
              <span className="landlord-stat-skeleton" aria-hidden="true" />
            </>
          ) : null}
          {stats.isError ? (
            <div className="landlord-stats-error">
              <p role="alert">The counts could not be loaded. Please try again.</p>
              <Button
                variant="secondary"
                size="md"
                loading={stats.isFetching}
                onClick={() => stats.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {stats.data ? (
            <>
              <StatCard label="New" value={stats.data.newJobs} tone="new" />
              <StatCard label="In Progress" value={stats.data.inProgress} tone="progress" />
              <StatCard label="Done" value={stats.data.doneThisMonth} tone="done" />
            </>
          ) : null}
        </section>
        <JobsTable />
      </div>
    </LandlordShell>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <article className={'landlord-stat landlord-stat-' + tone}>
      <p className="landlord-stat-value">{value}</p>
      <p className="landlord-stat-label">{label}</p>
    </article>
  )
}

