import { useQuery } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import UrgentTag from '../../components/UrgentTag.jsx'
import { useAuth } from '../auth/AuthProvider.jsx'
import { categoryLabel } from '../../lib/jobStatus.js'
import { fetchProviderJobs } from './api.js'
import './ProviderPage.css'

export default function ProviderPage() {
  const { session } = useAuth()
  const jobsQuery = useQuery({
    queryKey: ['provider-jobs', session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: fetchProviderJobs,
  })
  const jobs = jobsQuery.data ?? []

  return (
    <>
      <RoleHeader title="My Jobs Today" />
      <main className="provider-jobs">
        {jobsQuery.isPending ? <p className="visually-hidden">Loading jobs.</p> : null}

        {jobsQuery.isError ? (
          <div className="provider-jobs-error">
            <p role="alert">Jobs could not be loaded. Please try again.</p>
            <Button variant="secondary" size="xl" loading={jobsQuery.isFetching} onClick={() => jobsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!jobsQuery.isPending && !jobsQuery.isError && jobs.length === 0 ? (
          <EmptyState title="No jobs assigned to you today." />
        ) : null}

        {jobs.map((job) => (
          <article key={job.id} className="provider-job">
            <h2 className="provider-job-issue">
              <span>{categoryLabel(job.category)}</span>
              {job.urgent ? <UrgentTag /> : null}
            </h2>
            {job.description ? <p>{job.description}</p> : null}
            <StatusBadge status={job.status} />
          </article>
        ))}
      </main>
    </>
  )
}
