import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import PhotoViewer from '../../components/PhotoViewer.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import UrgentTag from '../../components/UrgentTag.jsx'
import { categoryLabel } from '../../lib/jobStatus.js'
import { useSignedUrl } from '../../lib/photos.js'
import AssignProviderModal from './AssignProviderModal.jsx'
import { fetchLandlordJob } from './api.js'
import LandlordShell from './LandlordShell.jsx'
import './JobDetailsPage.css'

const EVENT_LABELS = {
  pending: 'Reported',
  assigned: 'Assigned',
  on_the_way: 'On the way',
  done: 'Done',
}

export default function JobDetailsPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState('assign')
  const [success, setSuccess] = useState('')
  const jobQuery = useQuery({
    queryKey: ['landlord-job', jobId],
    enabled: Boolean(jobId),
    queryFn: () => fetchLandlordJob(jobId),
  })
  const job = jobQuery.data

  return (
    <LandlordShell>
      <div className="job-details">
        <Button variant="secondary" size="md" onClick={() => navigate('/landlord')}>
          Back
        </Button>

        {success ? (
          <p className="job-details-success" role="status">
            {success}
          </p>
        ) : null}

        {jobQuery.isPending ? (
          <>
            <p className="visually-hidden">Loading job.</p>
            <div className="job-details-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        ) : null}

        {jobQuery.isError ? (
          <div className="job-details-error">
            <p role="alert">This job could not be loaded. Please try again.</p>
            <Button variant="secondary" size="md" loading={jobQuery.isFetching} onClick={() => jobQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {jobQuery.isSuccess && !job ? <p>Job not found</p> : null}

        {job ? (
          <article className="job-details-body">
            {job.unitLabel ? <p className="job-details-unit">{job.unitLabel}</p> : null}
            <h1 className="job-details-issue">
              <span>{categoryLabel(job.category)}</span>
              {job.urgent ? <UrgentTag /> : null}
            </h1>
            {job.description ? <p className="job-details-description">{job.description}</p> : null}
            <StatusBadge status={job.status} />

            <section className="job-details-person" aria-labelledby="job-tenant-heading">
              <h2 id="job-tenant-heading">Tenant</h2>
              <Person name={job.tenantName} phone={job.tenantPhone} />
            </section>

            {job.provider ? (
              <section className="job-details-person" aria-labelledby="job-provider-heading">
                <h2 id="job-provider-heading">Provider</h2>
                <Person name={job.provider.name} trade={job.provider.trade} phone={job.provider.phone} />
              </section>
            ) : null}

            {job.status === 'pending' ? (
              <Button
                variant="primary"
                size="md"
                aria-haspopup="dialog"
                onClick={() => {
                  setAssignMode('assign')
                  setAssignOpen(true)
                }}
              >
                Assign Provider
              </Button>
            ) : null}
            {job.status === 'assigned' && job.providerId ? (
              <Button
                variant="secondary"
                size="md"
                aria-haspopup="dialog"
                onClick={() => {
                  setAssignMode('reassign')
                  setAssignOpen(true)
                }}
              >
                Reassign
              </Button>
            ) : null}

            <section className="job-details-photo" aria-labelledby="job-photo-heading">
              <h2 id="job-photo-heading">Tenant photo</h2>
              <DetailPhoto
                bucket="job-photos"
                path={job.photoPath}
                alt={'Problem at ' + (job.unitLabel || 'the flat')}
              />
            </section>

            {job.status === 'done' ? (
              <section className="job-details-photo" aria-labelledby="job-proof-heading">
                <h2 id="job-proof-heading">Proof photo</h2>
                <DetailPhoto
                  bucket="proof-photos"
                  path={job.proofPath}
                  alt={'Proof the work is done at ' + (job.unitLabel || 'the flat')}
                />
              </section>
            ) : null}

            <section aria-labelledby="job-timeline-heading">
              <h2 id="job-timeline-heading">Timeline</h2>
              {job.events.length > 0 ? (
                <ol className="job-timeline">
                  {job.events.map((event) => (
                    <li key={event.id}>
                      <span className="job-timeline-label">{EVENT_LABELS[event.toStatus] || 'Updated'}</span>
                      {event.note?.startsWith('Reassigned from ') ? (
                        <span className="job-timeline-note">{event.note}</span>
                      ) : null}
                      <time dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No history yet.</p>
              )}
            </section>
          </article>
        ) : null}

        <AssignProviderModal
          job={assignOpen ? job : null}
          mode={assignMode}
          onClose={() => setAssignOpen(false)}
          onAssigned={(providerName, unit, mode) => {
            setAssignOpen(false)
            setSuccess(
              mode === 'reassign'
                ? 'Reassigned to ' + providerName + '.'
                : unit
                  ? providerName + ' was assigned to ' + unit + '.'
                  : providerName + ' was assigned.',
            )
          }}
        />
      </div>
    </LandlordShell>
  )
}

function Person({ name, trade, phone }) {
  const phoneHref = phone ? 'tel:' + phone.replace(/\s/g, '') : ''

  return (
    <dl>
      <div>
        <dt>Name</dt>
        <dd>{name || 'Unknown'}</dd>
      </div>
      {trade ? (
        <div>
          <dt>Trade</dt>
          <dd>{trade}</dd>
        </div>
      ) : null}
      {phoneHref ? (
        <div>
          <dt>Phone</dt>
          <dd>
            <a href={phoneHref}>{phone}</a>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function DetailPhoto({ bucket, path, alt }) {
  const [broken, setBroken] = useState(false)
  const photo = useSignedUrl(bucket, path)

  if (!path || broken) return <p className="job-details-missing">No photo</p>
  if (photo.isPending) return <span className="job-details-photo-skeleton" aria-hidden="true" />
  if (photo.isError || !photo.data) return <p className="job-details-missing">The photo could not be opened.</p>

  return <PhotoViewer src={photo.data} alt={alt} onThumbError={() => setBroken(true)} />
}

function formatEventTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
