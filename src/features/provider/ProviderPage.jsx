import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import PhotoViewer from '../../components/PhotoViewer.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import UrgentTag from '../../components/UrgentTag.jsx'
import { categoryLabel } from '../../lib/jobStatus.js'
import { useSignedUrl } from '../../lib/photos.js'
import { useJobsRealtime } from '../../lib/useJobsRealtime.js'
import { usePullToRefresh } from '../../lib/usePullToRefresh.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { JobAlreadyStartedError, JobChangedError, fetchProviderJobs, markDone, markOnTheWay } from './api.js'
import './ProviderPage.css'

export default function ProviderPage() {
  const { session } = useAuth()
  useJobsRealtime('provider_id', session?.user?.id)
  const [doneNotice, setDoneNotice] = useState('')
  const jobsQuery = useQuery({
    queryKey: ['provider-jobs', session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: fetchProviderJobs,
  })
  const jobs = jobsQuery.data ?? []
  const pullLabel = usePullToRefresh(() => jobsQuery.refetch())

  return (
    <>
      <RoleHeader title="My Jobs Today" />
      <main className="provider-jobs" aria-busy={jobsQuery.isPending}>
        {pullLabel ? (
          <p className="pull-refresh" role="status">
            {pullLabel}
          </p>
        ) : null}
        <Button
          variant="secondary"
          size="xl"
          loading={jobsQuery.isFetching}
          onClick={() => jobsQuery.refetch()}
        >
          Refresh
        </Button>

        {doneNotice ? (
          <p className="provider-jobs-success" role="status">
            {doneNotice}
          </p>
        ) : null}

        {jobsQuery.isPending ? (
          <>
            <p className="visually-hidden">Loading jobs.</p>
            <JobsSkeleton />
          </>
        ) : null}

        {jobsQuery.isError ? (
          <p className="provider-jobs-error" role="alert">
            Jobs could not be loaded. Please try again.
          </p>
        ) : null}

        {!jobsQuery.isPending && !jobsQuery.isError && jobs.length === 0 ? (
          <EmptyState title="No jobs assigned to you today." />
        ) : null}

        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onDone={setDoneNotice} />
        ))}
      </main>
    </>
  )
}

function JobCard({ job, onDone }) {
  const queryClient = useQueryClient()
  const category = categoryLabel(job.category)
  const place = job.unitLabel || 'Unknown flat'
  const phoneHref = job.tenantPhone ? 'tel:' + job.tenantPhone.replace(/\s/g, '') : ''
  const start = useMutation({
    mutationFn: markOnTheWay,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-jobs'] }),
    onError: (startError) => {
      if (startError instanceof JobAlreadyStartedError) {
        queryClient.invalidateQueries({ queryKey: ['provider-jobs'] })
      }
    },
  })

  return (
    <article className="provider-job">
      <h2 className="provider-job-title">
        <span>{place + ' - ' + category}</span>
        {job.urgent ? <UrgentTag /> : null}
      </h2>
      <p className="provider-job-tenant">{job.tenantName || 'Unknown tenant'}</p>
      {job.tenantPhone ? <p className="provider-job-phone">{job.tenantPhone}</p> : null}
      {phoneHref ? (
        <a className="button button-primary button-xl" href={phoneHref}>
          Call
        </a>
      ) : null}
      <p className="provider-job-issue">Issue: {job.description || 'No description'}</p>
      <ViewPhoto path={job.photoPath} alt={'Problem at ' + place} />
      <StatusBadge status={job.status} />
      {job.status === 'assigned' ? (
        <Button
          variant="primary"
          size="xl"
          loading={start.isPending}
          onClick={() => start.mutate({ jobId: job.id })}
        >
          I AM ON MY WAY
        </Button>
      ) : null}
      {job.status === 'on_the_way' ? (
        <ProofSection job={job} place={place + ' - ' + category} onDone={onDone} />
      ) : null}
      {start.isError ? (
        <p className="provider-jobs-error" role="alert">
          {start.error.message}
        </p>
      ) : null}
    </article>
  )
}

function ProofSection({ job, place, onDone }) {
  const queryClient = useQueryClient()
  const fileRef = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const finish = useMutation({
    mutationFn: markDone,
    onSuccess: () => {
      onDone(place + ' is done. The proof photo was saved.')
      queryClient.invalidateQueries({ queryKey: ['provider-jobs'] })
    },
    onError: (finishError) => {
      if (finishError instanceof JobChangedError) {
        queryClient.invalidateQueries({ queryKey: ['provider-jobs'] })
      }
    },
  })

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function openCamera() {
    fileRef.current?.click()
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setPhoto(file)
    finish.reset()
  }

  return (
    <div className="provider-proof">
      {previewUrl ? <img src={previewUrl} alt="Preview of the finished work" /> : null}
      <Button
        type="button"
        variant={photo ? 'secondary' : 'primary'}
        size="xl"
        disabled={finish.isPending}
        onClick={openCamera}
      >
        {photo ? 'Retake' : 'MARK AS DONE + UPLOAD PROOF PHOTO'}
      </Button>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={choosePhoto}
      />
      <Button
        variant="primary"
        size="xl"
        loading={finish.isPending}
        disabled={!photo}
        onClick={() => finish.mutate({ jobId: job.id, landlordId: job.landlordId, photo })}
      >
        {finish.isError ? 'Retry' : 'Confirm: Job Done'}
      </Button>
      {finish.isError ? (
        <p className="provider-jobs-error" role="alert">
          {finish.error.message}
        </p>
      ) : null}
    </div>
  )
}

function ViewPhoto({ path, alt }) {
  const photo = useSignedUrl('job-photos', path)

  if (!path) return <p className="provider-job-missing">No photo</p>
  if (photo.isPending) {
    return (
      <Button variant="secondary" size="xl" loading>
        VIEW PHOTO
      </Button>
    )
  }
  if (photo.isError || !photo.data) {
    return (
      <p className="provider-job-missing" role="alert">
        The photo could not be opened.
      </p>
    )
  }

  return <PhotoViewer src={photo.data} alt={alt} label="VIEW PHOTO" />
}

function JobsSkeleton() {
  return (
    <div className="provider-skeleton" aria-hidden="true">
      <span />
      <span />
    </div>
  )
}
