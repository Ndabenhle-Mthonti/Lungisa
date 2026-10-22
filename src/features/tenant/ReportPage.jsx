import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import { fetchTenantPlace, sendReport } from './api.js'
import './ReportPage.css'

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'lock', label: 'Lock' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'other', label: 'Other' },
]

export default function ReportPage() {
  const navigate = useNavigate()
  const jobIdRef = useRef(null)
  const uploadedRef = useRef(false)
  const [category, setCategory] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const place = useQuery({
    queryKey: ['tenant-place'],
    queryFn: fetchTenantPlace,
  })

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setPhoto(file)
    setError('')
    jobIdRef.current = null
    uploadedRef.current = false
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (!category || !photo || sending) return

    const chosenCategory = category
    const chosenUrgent = urgent
    const chosenDescription = description
    const chosenPhoto = photo
    setSending(true)
    setError('')

    const jobId = jobIdRef.current ?? crypto.randomUUID()
    jobIdRef.current = jobId

    try {
      await sendReport({
        jobId,
        category: chosenCategory,
        isUrgent: chosenUrgent,
        description: chosenDescription,
        photo: chosenPhoto,
        alreadyUploaded: uploadedRef.current,
      })
      uploadedRef.current = true
      setSent(true)
    } catch (sendError) {
      if (sendError?.uploaded) uploadedRef.current = true
      setError(sendError instanceof Error ? sendError.message : 'The report could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <RoleHeader title="Report New Problem" />
      <main className="report-page">
        {sent ? (
          <div className="report-success">
            <p role="status">Sent! Your landlord has been notified. We will update you here.</p>
            <Button variant="primary" size="lg" onClick={() => navigate('/tenant')}>
              Back to Home
            </Button>
          </div>
        ) : (
          <form className="report-form" onSubmit={onSubmit}>
            <fieldset>
              <legend>What is the problem?</legend>
              {CATEGORIES.map((option) => (
                <label
                  key={option.value}
                  className={category === option.value ? 'report-option is-selected' : 'report-option'}
                >
                  <input
                    type="radio"
                    name="category"
                    value={option.value}
                    checked={category === option.value}
                    onChange={() => setCategory(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <label className="report-urgent">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(event) => setUrgent(event.target.checked)}
              />
              This is urgent (no water, no power, door will not lock)
            </label>

            <label className="report-field">
              Flat / Unit
              <input
                value={place.data?.label ?? ''}
                readOnly
                aria-readonly="true"
                placeholder={place.isLoading ? 'Loading your flat...' : ''}
              />
            </label>
            {place.isPending ? <p role="status">Loading your flat.</p> : null}
            {place.isError ? (
              <div className="report-error-block">
                <p className="report-error" role="alert">
                  {place.error instanceof Error ? place.error.message : 'Your flat could not be loaded. Please try again.'}
                </p>
                <Button variant="secondary" size="lg" onClick={() => place.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}

            <label className="report-field">
              Describe it
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Kitchen tap is leaking badly..."
              />
            </label>

            <div className="report-photo">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview of the problem" loading="lazy" />
              ) : null}
              <label className="report-photo-pick button button-secondary button-lg">
                {photo ? 'Retake' : 'Take a Photo'}
                <input
                  className="photo-file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Photo of the problem"
                  onChange={choosePhoto}
                />
              </label>
            </div>

            {error ? (
              <p className="report-error" role="alert">{error}</p>
            ) : null}

            {!category || !photo ? (
              <p className="report-hint">Choose the problem and add a photo. Then you can send it.</p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={sending}
              disabled={!category || !photo}
            >
              {error ? 'Retry' : 'Send to Landlord'}
            </Button>
          </form>
        )}
      </main>
    </>
  )
}
