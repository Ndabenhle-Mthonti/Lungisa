import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { formatReportedDate, tenantJobStatus } from '../../lib/jobStatus.js'
import { useJobsRealtime } from '../../lib/useJobsRealtime.js'
import { usePullToRefresh } from '../../lib/usePullToRefresh.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { categoryLabel } from './api.js'
import { useTenantRequests } from './useTenantRequests.js'
import './TenantPage.css'

export default function TenantPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  useJobsRealtime('tenant_id', session?.user?.id)
  const requests = useTenantRequests()
  const pullLabel = usePullToRefresh(() => requests.refetch())
  const jobs = requests.data?.pages.flatMap((page) => page.rows) ?? []

  return (
    <>
      <RoleHeader title="Home" />
      <main className="tenant-home">
        {pullLabel ? (
          <p className="pull-refresh" role="status">
            {pullLabel}
          </p>
        ) : null}
        <Button
          variant="secondary"
          size="lg"
          loading={requests.isFetching && !requests.isFetchingNextPage}
          onClick={() => requests.refetch()}
        >
          Refresh
        </Button>
        <Button variant="primary" size="lg" onClick={() => navigate('/tenant/report')}>
          + Report New Problem
        </Button>

        {requests.isPending ? <RequestSkeleton /> : null}

        {requests.isError && jobs.length === 0 ? (
          <div className="tenant-home-error">
            <p role="alert">Your requests could not be loaded. Please try again.</p>
            <Button variant="secondary" size="lg" onClick={() => requests.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!requests.isPending && !requests.isError && jobs.length === 0 ? (
          <EmptyState
            title="You have no requests yet."
            message="When you report a problem, it will show up here."
          />
        ) : null}

        {jobs.length > 0 ? (
          <ul className="tenant-requests">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  className="tenant-request"
                  onClick={() => navigate('/tenant/requests/' + job.id)}
                >
                  <span className="tenant-request-category">{categoryLabel(job.category)}</span>
                  {job.description ? (
                    <span className="tenant-request-issue">{job.description}</span>
                  ) : null}
                  <span className="tenant-request-meta">
                    <StatusBadge status={job.status} label={tenantJobStatus(job.status)} />
                    <span>Reported: {formatReportedDate(job.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {requests.hasNextPage ? (
          <Button
            variant="secondary"
            size="lg"
            loading={requests.isFetchingNextPage}
            onClick={() => requests.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}

        {requests.isError && jobs.length > 0 ? (
          <div className="tenant-home-error">
            <p role="alert">More requests could not be loaded. Please try again.</p>
            <Button variant="secondary" size="lg" onClick={() => requests.fetchNextPage()}>
              Retry
            </Button>
          </div>
        ) : null}
      </main>
    </>
  )
}

function RequestSkeleton() {
  return (
    <div className="tenant-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}
