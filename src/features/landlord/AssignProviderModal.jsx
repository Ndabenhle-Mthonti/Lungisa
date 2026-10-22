import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import UrgentTag from '../../components/UrgentTag.jsx'
import { categoryLabel } from '../../lib/jobStatus.js'
import {
  AlreadyAssignedError,
  JobChangedError,
  assignProvider,
  fetchProviders,
  reassignProvider,
  tradeLabel,
} from './api.js'
import './AssignProviderModal.css'

export default function AssignProviderModal({ job, mode = 'assign', onClose, onAssigned }) {
  const queryClient = useQueryClient()
  const [providerId, setProviderId] = useState('')
  const [error, setError] = useState('')
  const providers = useQuery({
    queryKey: ['landlord-providers'],
    queryFn: fetchProviders,
    enabled: Boolean(job),
  })

  useEffect(() => {
    setProviderId('')
    setError('')
  }, [job?.id, mode])

  const providerList = (providers.data ?? []).filter(
    (person) => mode !== 'reassign' || person.id !== job?.providerId,
  )
  const reassigning = mode === 'reassign'

  const assign = useMutation({
    mutationFn: (variables) =>
      variables.mode === 'reassign' ? reassignProvider(variables) : assignProvider(variables),
    onSuccess: async (_data, variables) => {
      onAssigned(variables.providerName, variables.unitLabel, variables.mode)
      await refreshJobs(queryClient)
    },
    onError: async (assignError) => {
      setError(assignError.message)
      if (assignError instanceof AlreadyAssignedError || assignError instanceof JobChangedError) {
        await refreshJobs(queryClient)
      }
    },
  })

  function submit(event) {
    event.preventDefault()
    if (assign.isPending || !job) return
    setError('')
    if (!providerId) {
      setError('Choose a provider.')
      return
    }
    const provider = providerList.find((person) => person.id === providerId)
    assign.mutate({
      jobId: job.id,
      providerId,
      previousProviderId: job.providerId,
      providerName: providerLabel(provider),
      unitLabel: job.unitLabel,
      mode,
    })
  }

  return (
    <Modal open={Boolean(job)} title={reassigning ? 'Change provider' : 'Assign provider'} onClose={onClose}>
      {job ? (
        <form className="assign-form" onSubmit={submit}>
          <dl className="assign-summary">
            <div>
              <dt>Flat / Unit</dt>
              <dd>{job.unitLabel || 'No flat name'}</dd>
            </div>
            <div>
              <dt>Issue</dt>
              <dd>
                <span className="assign-issue-line">
                  <span>{categoryLabel(job.category)}</span>
                  {job.urgent ? <UrgentTag /> : null}
                </span>
                {job.description ? <span className="assign-description">{job.description}</span> : null}
              </dd>
            </div>
          </dl>

          <label className="assign-field" htmlFor="assign-provider">
            Provider
            <select
              id="assign-provider"
              value={providerId}
              disabled={providers.isPending || assign.isPending}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">
                {providers.isPending ? 'Loading providers…' : 'Choose a provider'}
              </option>
              {providerList.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {providerLabel(provider)}
                </option>
              ))}
            </select>
          </label>

          {providers.isError ? (
            <div className="assign-error">
              <p role="alert">Providers could not be loaded. Please try again.</p>
              <Button
                variant="secondary"
                size="md"
                loading={providers.isFetching}
                onClick={() => providers.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {!providers.isPending && !providers.isError && providerList.length === 0 ? (
            <p className="assign-error" role="alert">
              {reassigning
                ? 'No other providers yet. Invite one from the People page.'
                : 'No providers yet. Invite one from the People page.'}
            </p>
          ) : null}

          {error ? (
            <p className="assign-error" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={assign.isPending}
            disabled={providers.isPending || providers.isError || providerList.length === 0}
          >
            {error ? 'Retry' : reassigning ? 'Change provider' : 'Assign'}
          </Button>
        </form>
      ) : null}
    </Modal>
  )
}

function providerLabel(provider) {
  if (!provider) return 'Provider'
  const trade = tradeLabel(provider.trade)
  return trade ? provider.full_name + ' - ' + trade : provider.full_name
}

function refreshJobs(queryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['landlord-jobs'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-job'] }),
  ])
}
