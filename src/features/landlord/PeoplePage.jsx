import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import Modal from '../../components/Modal.jsx'
import Spinner from '../../components/Spinner.jsx'
import { addUnit, fetchPeople, invitePerson, removePerson, tradeLabel, TRADES, updatePerson } from './api.js'
import LandlordShell from './LandlordShell.jsx'
import './PeoplePage.css'

export default function PeoplePage() {
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [notice, setNotice] = useState('')
  const people = useQuery({
    queryKey: ['landlord-people'],
    queryFn: fetchPeople,
  })
  const takenUnitIds = (people.data?.tenants ?? []).map((person) => person.unit_id).filter(Boolean)

  return (
    <LandlordShell>
      <div className="people-page">
        <h1>People</h1>

        {people.isPending ? <Spinner /> : null}

        {people.isError ? (
          <div className="people-load-error">
            <p role="alert">People could not be loaded. Please try again.</p>
            <Button variant="secondary" size="md" onClick={() => people.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {people.data ? (
          <>
            {notice ? (
              <p className="people-success" role="status">
                {notice}
              </p>
            ) : null}
            <AddUnitForm properties={people.data.properties} />
            <InviteTenantForm units={people.data.units} takenUnitIds={takenUnitIds} />
            <InviteProviderForm />
            <PersonList
              title="Tenants"
              emptyTitle="No tenants yet."
              emptyMessage="Invite a tenant and they will show up here."
              people={people.data.tenants}
              detail={(person) => unitLabel(people.data.units, person.unit_id)}
              onEdit={setEditing}
              onRemove={setRemoving}
            />
            <PersonList
              title="Providers"
              emptyTitle="No providers yet."
              emptyMessage="Invite a provider and they will show up here."
              people={people.data.providers}
              detail={(person) => tradeLabel(person.trade)}
              onEdit={setEditing}
              onRemove={setRemoving}
            />
            <EditPersonModal
              person={editing}
              onClose={() => setEditing(null)}
              onSaved={(name) => {
                setEditing(null)
                setNotice(name + ' was updated.')
              }}
            />
            <RemovePersonModal
              person={removing}
              flat={removing ? unitLabel(people.data.units, removing.unit_id) : ''}
              onClose={() => setRemoving(null)}
              onRemoved={(name, flat) => {
                setRemoving(null)
                setNotice(
                  flat
                    ? name + ' was removed. ' + flat + ' can be given to a new tenant.'
                    : name + ' was removed.',
                )
              }}
            />
          </>
        ) : null}
      </div>
    </LandlordShell>
  )
}

function AddUnitForm({ properties }) {
  const queryClient = useQueryClient()
  const [propertyId, setPropertyId] = useState('')
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState(null)
  const selectedProperty = propertyId || properties[0]?.id || ''

  const add = useMutation({
    mutationFn: (body) => addUnit(body),
    onSuccess: async (_data, body) => {
      setLabel('')
      setMessage({ type: 'success', text: body.label.trim() + ' was added.' })
      await queryClient.invalidateQueries({ queryKey: ['landlord-people'] })
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message })
    },
  })

  function submit(event) {
    event.preventDefault()
    setMessage(null)
    if (!selectedProperty) {
      setMessage({ type: 'error', text: 'Add a property before you add a unit.' })
      return
    }
    if (!label.trim()) {
      setMessage({ type: 'error', text: 'Enter a unit label.' })
      return
    }
    add.mutate({ propertyId: selectedProperty, label })
  }

  return (
    <section>
      <h2>Add a unit</h2>
      <form className="people-form" onSubmit={submit}>
        <label className="people-field">
          Property
          <select value={selectedProperty} onChange={(event) => setPropertyId(event.target.value)}>
            {properties.length === 0 ? <option value="">No property yet</option> : null}
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <label className="people-field">
          Unit label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Flat 4B"
            maxLength={40}
          />
        </label>
        <FormMessage message={message} />
        <Button type="submit" size="md" loading={add.isPending} disabled={properties.length === 0}>
          {message?.type === 'error' ? 'Retry' : 'Add unit'}
        </Button>
      </form>
    </section>
  )
}

function InviteTenantForm({ units, takenUnitIds }) {
  const queryClient = useQueryClient()
  const [unitId, setUnitId] = useState('')
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '' })
  const [message, setMessage] = useState(null)
  const openUnits = units.filter((unit) => !takenUnitIds.includes(unit.id))
  const selectedUnit = openUnits.some((unit) => unit.id === unitId) ? unitId : openUnits[0]?.id || ''

  const invite = useMutation({
    mutationFn: (body) => invitePerson(body),
    onSuccess: async (_data, body) => {
      setMessage({ type: 'success', text: 'Invite sent to ' + body.email + '.' })
      setFields({ fullName: '', phone: '', email: '' })
      await queryClient.invalidateQueries({ queryKey: ['landlord-people'] })
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message })
    },
  })

  function submit(event) {
    event.preventDefault()
    const problem = personProblem(fields) || (!selectedUnit ? 'Choose a flat that has no tenant.' : '')
    setMessage(problem ? { type: 'error', text: problem } : null)
    if (problem) return
    invite.mutate({
      email: fields.email.trim(),
      full_name: fields.fullName.trim(),
      phone: fields.phone.trim(),
      role: 'tenant',
      unit_id: selectedUnit,
    })
  }

  return (
    <section>
      <h2>Invite a tenant</h2>
      {openUnits.length === 0 ? (
        <p className="people-note">
          {units.length === 0
            ? 'Add a flat before you invite a tenant.'
            : 'Every flat already has a tenant. Remove that tenant before you invite a new one.'}
        </p>
      ) : null}
      <form className="people-form" onSubmit={submit}>
        <PersonFields fields={fields} onChange={setFields} />
        <label className="people-field">
          Flat
          <select value={selectedUnit} onChange={(event) => setUnitId(event.target.value)}>
            {openUnits.length === 0 ? <option value="">No open flat</option> : null}
            {openUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <FormMessage message={message} />
        <Button type="submit" size="md" loading={invite.isPending} disabled={openUnits.length === 0}>
          {message?.type === 'error' ? 'Retry' : 'Send invite'}
        </Button>
      </form>
    </section>
  )
}

function InviteProviderForm() {
  const queryClient = useQueryClient()
  const [trade, setTrade] = useState(TRADES[0].value)
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '' })
  const [message, setMessage] = useState(null)

  const invite = useMutation({
    mutationFn: (body) => invitePerson(body),
    onSuccess: async (_data, body) => {
      setMessage({ type: 'success', text: 'Invite sent to ' + body.email + '.' })
      setFields({ fullName: '', phone: '', email: '' })
      await queryClient.invalidateQueries({ queryKey: ['landlord-people'] })
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message })
    },
  })

  function submit(event) {
    event.preventDefault()
    const problem = personProblem(fields) || (!trade ? 'Choose the type of work.' : '')
    setMessage(problem ? { type: 'error', text: problem } : null)
    if (problem) return
    invite.mutate({
      email: fields.email.trim(),
      full_name: fields.fullName.trim(),
      phone: fields.phone.trim(),
      role: 'provider',
      trade,
    })
  }

  return (
    <section>
      <h2>Invite a provider</h2>
      <form className="people-form" onSubmit={submit}>
        <PersonFields fields={fields} onChange={setFields} />
        <label className="people-field">
          Type of work
          <select value={trade} onChange={(event) => setTrade(event.target.value)}>
            {TRADES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <FormMessage message={message} />
        <Button type="submit" size="md" loading={invite.isPending}>
          {message?.type === 'error' ? 'Retry' : 'Send invite'}
        </Button>
      </form>
    </section>
  )
}

function PersonFields({ fields, onChange }) {
  function change(key) {
    return (event) => onChange({ ...fields, [key]: event.target.value })
  }

  return (
    <>
      <label className="people-field">
        Name
        <input value={fields.fullName} onChange={change('fullName')} maxLength={80} />
      </label>
      <label className="people-field">
        Phone
        <input value={fields.phone} onChange={change('phone')} inputMode="tel" maxLength={20} />
      </label>
      <label className="people-field">
        Email
        <input value={fields.email} onChange={change('email')} type="email" maxLength={320} />
      </label>
    </>
  )
}

function PersonList({ title, emptyTitle, emptyMessage, people, detail, onEdit, onRemove }) {
  return (
    <section>
      <h2>{title}</h2>
      {people.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <ul className="people-list">
          {people.map((person) => (
            <li key={person.id}>
              <div className="people-person">
                <span className="people-name">{person.full_name}</span>
                <span>{person.phone || 'No phone number'}</span>
                <span>{person.email || 'No email'}</span>
                <span>{detail(person) || 'Not added yet'}</span>
              </div>
              <div className="people-person-actions">
                <Button variant="secondary" size="md" onClick={() => onEdit(person)}>
                  Edit
                </Button>
                <Button variant="secondary" size="md" onClick={() => onRemove(person)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EditPersonModal({ person, onClose, onSaved }) {
  const queryClient = useQueryClient()
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '' })
  const [message, setMessage] = useState(null)
  const save = useMutation({
    mutationFn: updatePerson,
    onSuccess: async () => {
      await refreshPeople(queryClient)
      onSaved(fields.fullName.trim())
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  })

  useEffect(() => {
    if (!person) return
    setFields({
      fullName: person.full_name ?? '',
      phone: person.phone ?? '',
      email: person.email ?? '',
    })
    setMessage(null)
  }, [person])

  function submit(event) {
    event.preventDefault()
    if (!person || save.isPending) return
    const problem = personProblem(fields)
    setMessage(problem ? { type: 'error', text: problem } : null)
    if (problem) return
    save.mutate({
      person_id: person.id,
      full_name: fields.fullName.trim(),
      phone: fields.phone.trim(),
      email: fields.email.trim(),
    })
  }

  const title = person?.role === 'provider' ? 'Edit provider' : 'Edit tenant'

  return (
    <Modal open={Boolean(person)} title={title} onClose={onClose} canClose={!save.isPending}>
      <form className="people-form" onSubmit={submit}>
        <PersonFields fields={fields} onChange={setFields} />
        <FormMessage message={message} />
        <Button type="submit" size="md" loading={save.isPending}>
          {message?.type === 'error' ? 'Retry' : 'Save'}
        </Button>
      </form>
    </Modal>
  )
}

function RemovePersonModal({ person, flat, onClose, onRemoved }) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState(null)
  const remove = useMutation({
    mutationFn: removePerson,
    onSuccess: async () => {
      const name = person?.full_name || 'This person'
      await refreshPeople(queryClient)
      onRemoved(name, person?.role === 'tenant' ? flat : '')
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  })

  useEffect(() => {
    setMessage(null)
  }, [person?.id])

  const name = person?.full_name || 'this person'
  const explanation = person?.role === 'provider'
    ? 'Their name, phone, and email are deleted, and they cannot sign in. Jobs they have not finished go back to Pending.'
    : 'Their name, phone, and email are deleted, and they cannot sign in. Past jobs stay.'
      + (flat ? ' ' + flat + ' can then be given to a new tenant.' : '')

  return (
    <Modal open={Boolean(person)} title={'Remove ' + name} onClose={onClose} canClose={!remove.isPending}>
      <div className="people-form">
        <p className="people-note">{explanation}</p>
        <FormMessage message={message} />
        <Button
          variant="danger"
          size="md"
          loading={remove.isPending}
          onClick={() => {
            if (!person || remove.isPending) return
            setMessage(null)
            remove.mutate(person.id)
          }}
        >
          {message?.type === 'error' ? 'Retry' : 'Remove'}
        </Button>
      </div>
    </Modal>
  )
}

function refreshPeople(queryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['landlord-people'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-jobs'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-providers'] }),
    queryClient.invalidateQueries({ queryKey: ['landlord-job'] }),
  ])
}

function FormMessage({ message }) {
  if (!message) return null
  return (
    <p className={message.type === 'error' ? 'people-error' : 'people-success'} role={message.type === 'error' ? 'alert' : 'status'}>
      {message.text}
    </p>
  )
}

function personProblem(fields) {
  if (!fields.fullName.trim()) return 'Enter a name.'
  if (!fields.phone.trim()) return 'Enter a phone number.'
  if (!fields.email.trim() || !fields.email.includes('@')) return 'Enter an email.'
  return ''
}

function unitLabel(units, unitId) {
  return units.find((unit) => unit.id === unitId)?.label ?? ''
}
