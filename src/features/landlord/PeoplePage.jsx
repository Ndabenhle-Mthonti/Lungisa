import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'
import Spinner from '../../components/Spinner.jsx'
import { addUnit, fetchPeople, invitePerson, tradeLabel, TRADES } from './api.js'
import './PeoplePage.css'

export default function PeoplePage() {
  const navigate = useNavigate()
  const people = useQuery({
    queryKey: ['landlord-people'],
    queryFn: fetchPeople,
  })

  return (
    <>
      <RoleHeader title="People" />
      <main className="people-page">
        <Button variant="secondary" size="md" onClick={() => navigate('/landlord')}>
          Back
        </Button>

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
            <AddUnitForm properties={people.data.properties} />
            <InviteTenantForm units={people.data.units} />
            <InviteProviderForm />
            <PersonList
              title="Tenants"
              emptyTitle="No tenants yet."
              emptyMessage="Invite a tenant and they will show up here."
              people={people.data.tenants}
              detail={(person) => unitLabel(people.data.units, person.unit_id)}
            />
            <PersonList
              title="Providers"
              emptyTitle="No providers yet."
              emptyMessage="Invite a provider and they will show up here."
              people={people.data.providers}
              detail={(person) => tradeLabel(person.trade)}
            />
          </>
        ) : null}
      </main>
    </>
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
          Add unit
        </Button>
      </form>
    </section>
  )
}

function InviteTenantForm({ units }) {
  const queryClient = useQueryClient()
  const [unitId, setUnitId] = useState('')
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '' })
  const [message, setMessage] = useState(null)
  const selectedUnit = unitId || units[0]?.id || ''

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
    const problem = personProblem(fields) || (!selectedUnit ? 'Choose a flat.' : '')
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
      <form className="people-form" onSubmit={submit}>
        <PersonFields fields={fields} onChange={setFields} />
        <label className="people-field">
          Flat
          <select value={selectedUnit} onChange={(event) => setUnitId(event.target.value)}>
            {units.length === 0 ? <option value="">No flats yet</option> : null}
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <FormMessage message={message} />
        <Button type="submit" size="md" loading={invite.isPending} disabled={units.length === 0}>
          Send invite
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
    const problem = personProblem(fields) || (!trade ? 'Choose a trade.' : '')
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
          Trade
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
          Send invite
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

function PersonList({ title, emptyTitle, emptyMessage, people, detail }) {
  return (
    <section>
      <h2>{title}</h2>
      {people.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <ul className="people-list">
          {people.map((person) => (
            <li key={person.id}>
              <span className="people-name">{person.full_name}</span>
              <span>{person.phone || 'No phone'}</span>
              <span>{detail(person) || 'Not set'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
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
