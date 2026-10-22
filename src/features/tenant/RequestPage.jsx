import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import Modal from '../../components/Modal.jsx'
import PhotoViewer from '../../components/PhotoViewer.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import Spinner from '../../components/Spinner.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useSignedUrl } from '../../lib/photos.js'
import { formatReportedDate, tenantJobStatus } from '../../lib/jobStatus.js'
import { useJobsRealtime } from '../../lib/useJobsRealtime.js'
import { useAuth } from '../auth/AuthProvider.jsx'
import { categoryLabel, fetchTenantRequest, reopenRequest } from './api.js'
import './RequestPage.css'

export default function RequestPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  useJobsRealtime('tenant_id', session?.user?.id)
  const [sentBack, setSentBack] = useState(false)
  const request = useQuery({
    queryKey: ['tenant-request', jobId],
    enabled: Boolean(jobId),
    queryFn: () => fetchTenantRequest(jobId),
  })

  const job = request.data

  return (
    <>
      <RoleHeader title="Request" />
      <main className="request-page">
        <Button variant="secondary" size="lg" onClick={() => navigate('/tenant')}>
          Back to Home
        </Button>

        {request.isPending ? <Spinner /> : null}

        {request.isError ? (
          <div className="request-error">
            <p role="alert">This request could not be loaded. Please try again.</p>
            <Button variant="secondary" size="lg" onClick={() => request.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {request.isSuccess && !job ? (
          <EmptyState
            title="This request is not on your list."
            message="Go back home to see the requests that are yours."
          />
        ) : null}

        {job ? (
          <article className="request-detail">
            {sentBack ? <p className="request-sent-back">We sent it back to your provider.</p> : null}
            <h2>{categoryLabel(job.category)}</h2>
            <StatusBadge status={job.status} label={tenantJobStatus(job.status)} />
            {job.reopen_count > 0 && job.status !== 'done' ? (
              <p className="request-reopened">Sent back because it was not fixed.</p>
            ) : null}
            {job.description ? <p>{job.description}</p> : null}
            <p>Reported: {formatReportedDate(job.created_at)}</p>
            <JobPhoto bucket="job-photos" path={job.photo_path} alt="Photo of the problem" />
            {job.status === 'done' && job.proof_photo_path ? (
              <section>
                <h2>Photo of the finished work</h2>
                <JobPhoto
                  bucket="proof-photos"
                  path={job.proof_photo_path}
                  alt="Photo of the finished work"
                />
              </section>
            ) : null}
            {job.status === 'done' ? (
              <NotFixed jobId={job.id} onSent={() => setSentBack(true)} />
            ) : null}
          </article>
        ) : null}
      </main>
    </>
  )
}

function NotFixed({ jobId, onSent }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const reopen = useMutation({
    mutationFn: (nextNote) => reopenRequest({ jobId, note: nextNote }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tenant-request', jobId], (current) =>
        current
          ? {
              ...current,
              status: updated.status,
              reopen_count: updated.reopen_count,
              proof_photo_path: updated.proof_photo_path,
            }
          : current,
      )
      queryClient.invalidateQueries({ queryKey: ['tenant-request', jobId] })
      queryClient.invalidateQueries({ queryKey: ['tenant-requests'] })
      setOpen(false)
      setNote('')
      onSent()
    },
  })

  const noteReady = note.trim().length >= 5

  function closeModal() {
    if (reopen.isPending) return
    setOpen(false)
  }

  function sendBack(event) {
    event.preventDefault()
    if (!noteReady || reopen.isPending) return
    reopen.mutate(note)
  }

  return (
    <>
      <Button variant="secondary" size="lg" onClick={() => setOpen(true)}>
        Not fixed
      </Button>
      <Modal open={open} title="Not fixed" onClose={closeModal} closeSize="lg">
        <form className="request-reopen" onSubmit={sendBack}>
          <label className="request-note">
            What is still wrong?
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                if (reopen.isError) reopen.reset()
              }}
              required
              minLength={5}
              rows={4}
            />
          </label>
          {reopen.isError ? <p role="alert">{reopen.error.message}</p> : null}
          <Button type="submit" size="lg" loading={reopen.isPending} disabled={!noteReady}>
            {reopen.isError ? 'Retry' : 'Send back'}
          </Button>
        </form>
      </Modal>
    </>
  )
}

function JobPhoto({ bucket, path, alt }) {
  const photo = useSignedUrl(bucket, path)
  if (photo.isPending) return <Spinner />
  if (photo.isError || !photo.data) {
    return (
      <div className="request-error">
        <p className="request-error-text" role="alert">The photo could not be opened.</p>
        <Button variant="secondary" size="lg" onClick={() => photo.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  return <PhotoViewer src={photo.data} alt={alt} closeSize="lg" />
}
