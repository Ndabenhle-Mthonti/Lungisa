import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import PhotoViewer from '../../components/PhotoViewer.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import UrgentTag from '../../components/UrgentTag.jsx'
import { assignActionLabel, categoryLabel, changeWorkerLabel, onTheWayLabel } from '../../lib/jobStatus.js'
import { useJobThumbnail, useSignedUrl } from '../../lib/photos.js'
import AssignProviderModal from './AssignProviderModal.jsx'
import { useLandlordJobs } from './useLandlordJobs.js'
import './JobsTable.css'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

export default function JobsTable() {
  const [status, setStatus] = useState('')
  const [unit, setUnit] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [assignJob, setAssignJob] = useState(null)
  const [assignMode, setAssignMode] = useState('assign')
  const [success, setSuccess] = useState('')
  const debouncedUnit = useDebounced(unit.trim(), 300)
  const jobsQuery = useLandlordJobs({ status, unit: debouncedUnit, urgentOnly })
  const jobs = jobsQuery.data?.pages.flatMap((page) => page.rows) ?? []
  const filtered = Boolean(status || debouncedUnit || urgentOnly)

  return (
    <section className="jobs-section" aria-labelledby="jobs-heading" aria-busy={jobsQuery.isPending}>
      <h2 id="jobs-heading">Jobs</h2>
      {success ? (
        <p className="jobs-success" role="status">
          {success}
        </p>
      ) : null}
      <JobFilters
        status={status}
        onStatus={setStatus}
        unit={unit}
        onUnit={setUnit}
        urgentOnly={urgentOnly}
        onUrgentOnly={setUrgentOnly}
      />

      {jobsQuery.isPending ? (
        <>
          <p className="visually-hidden">Loading jobs.</p>
          <JobsSkeleton />
        </>
      ) : null}

      {jobsQuery.isError && jobs.length === 0 ? (
        <div className="jobs-error">
          <p role="alert">Jobs could not be loaded. Please try again.</p>
          <Button variant="secondary" size="md" loading={jobsQuery.isFetching} onClick={() => jobsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!jobsQuery.isPending && !jobsQuery.isError && jobs.length === 0 ? (
        <EmptyState
          title={filtered ? 'No jobs match.' : 'No jobs yet.'}
          message={
            filtered
              ? 'Try another unit or status.'
              : 'When a tenant reports a problem, it will show up here.'
          }
        />
      ) : null}

      {jobs.length > 0 ? (
        <div className="jobs-scroll">
          <table className="jobs-table">
            <caption className="visually-hidden">Maintenance jobs</caption>
            <thead>
              <tr>
                <th scope="col">Flat / Unit</th>
                <th scope="col">Issue</th>
                <th scope="col">Tenant</th>
                <th scope="col">Photo</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  onAssign={(next) => {
                    setAssignMode('assign')
                    setAssignJob(next)
                  }}
                  onReassign={(next) => {
                    setAssignMode('reassign')
                    setAssignJob(next)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {jobsQuery.hasNextPage && !jobsQuery.isError ? (
        <Button
          variant="secondary"
          size="md"
          loading={jobsQuery.isFetchingNextPage}
          onClick={() => jobsQuery.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}

      {jobsQuery.isError && jobs.length > 0 ? (
        <div className="jobs-error">
          <p role="alert">More jobs could not be loaded. Please try again.</p>
          <Button
            variant="secondary"
            size="md"
            loading={jobsQuery.isFetching}
            onClick={() => jobsQuery.fetchNextPage()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <AssignProviderModal
        job={assignJob}
        mode={assignMode}
        onClose={() => setAssignJob(null)}
        onAssigned={(providerName, unit, mode) => {
          setAssignJob(null)
          setSuccess(
            mode === 'reassign'
              ? 'Changed to ' + providerName + '.'
              : unit
                ? providerName + ' was assigned to ' + unit + '.'
                : providerName + ' was assigned.',
          )
        }}
      />
    </section>
  )
}

function JobFilters({ status, onStatus, unit, onUnit, urgentOnly, onUrgentOnly }) {
  return (
    <div className="jobs-filters">
      <fieldset className="jobs-status-filter">
        <legend className="visually-hidden">Filter by status</legend>
        {STATUS_FILTERS.map((item) => (
          <Button
            key={item.value || 'all'}
            variant={status === item.value ? 'primary' : 'secondary'}
            size="md"
            aria-pressed={status === item.value}
            onClick={() => onStatus(item.value)}
          >
            {item.label}
          </Button>
        ))}
        <Button
          variant={urgentOnly ? 'primary' : 'secondary'}
          size="md"
          aria-pressed={urgentOnly}
          onClick={() => onUrgentOnly(!urgentOnly)}
        >
          Urgent only
        </Button>
      </fieldset>
      <label className="jobs-search">
        Search by unit
        <input
          type="search"
          value={unit}
          placeholder="Flat 4B"
          onChange={(event) => onUnit(event.target.value)}
        />
      </label>
    </div>
  )
}

function JobRow({ job, onAssign, onReassign }) {
  const phoneHref = job.tenantPhone ? 'tel:' + job.tenantPhone.replace(/\s/g, '') : ''

  return (
    <tr>
      <td className="jobs-unit" data-label="Flat / Unit">
        <span className="jobs-label">Flat / Unit</span>
        {job.unitLabel}
      </td>
      <td className="jobs-issue" data-label="Issue">
        <span className="jobs-label">Issue</span>
        <span className="jobs-issue-line">
          <span className="jobs-category">{categoryLabel(job.category)}</span>
          {job.urgent ? <UrgentTag /> : null}
        </span>
        {job.description ? <span className="jobs-description">{job.description}</span> : null}
      </td>
      <td className="jobs-tenant" data-label="Tenant">
        <span className="jobs-label">Tenant</span>
        <span className="jobs-tenant-name">{job.tenantName}</span>
        {phoneHref ? (
          <a className="jobs-phone" href={phoneHref}>
            {job.tenantPhone}
          </a>
        ) : null}
      </td>
      <td className="jobs-photo" data-label="Photo">
        <span className="jobs-label">Photo</span>
        <JobPhoto path={job.photoPath} alt={'Problem at ' + (job.unitLabel || 'the flat')} />
      </td>
      <td className="jobs-status" data-label="Status">
        <span className="jobs-label">Status</span>
        <StatusBadge
          status={job.status}
          label={job.status === 'on_the_way' ? onTheWayLabel(job.category) : undefined}
        />
      </td>
      <td className="jobs-action" data-label="Action">
        <span className="jobs-label">Action</span>
        {job.status === 'pending' ? (
          <Button variant="primary" size="md" aria-haspopup="dialog" onClick={() => onAssign(job)}>
            {assignActionLabel(job.category)}
          </Button>
        ) : (
          <div className="jobs-actions">
            {job.status === 'assigned' && job.providerId ? (
              <Button variant="secondary" size="md" aria-haspopup="dialog" onClick={() => onReassign(job)}>
                {changeWorkerLabel(job.category)}
              </Button>
            ) : null}
            <Link className="button button-secondary button-md" to={'/landlord/jobs/' + job.id}>
              View details
            </Link>
          </div>
        )}
      </td>
    </tr>
  )
}

function JobPhoto({ path, alt }) {
  const [plain, setPlain] = useState(false)
  const [broken, setBroken] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const thumb = useJobThumbnail(path, { plain })
  const full = useSignedUrl('job-photos', fullOpen ? path : null)

  if (!path) return <span className="jobs-photo-missing">No photo was added</span>
  if (broken || thumb.isError) return <span className="jobs-photo-missing">The photo could not be opened.</span>
  if (thumb.isPending || !thumb.data?.url) {
    return <span className="jobs-photo-skeleton" aria-hidden="true" />
  }

  return (
    <PhotoViewer
      thumbSrc={thumb.data.url}
      src={full.data || thumb.data.url}
      alt={alt}
      onOpen={() => setFullOpen(true)}
      onThumbError={() => {
        if (!plain && thumb.data?.transformed) setPlain(true)
        else setBroken(true)
      }}
    />
  )
}

function JobsSkeleton() {
  return (
    <div className="jobs-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
