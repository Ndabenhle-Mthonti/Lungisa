import { supabase } from '../../lib/supabaseClient.js'

const PAGE_SIZE = 20
// In Progress is the same pair the stat card counts: assigned and on the way.
const STATUS_GROUPS = {
  pending: ['pending'],
  in_progress: ['assigned', 'on_the_way'],
  done: ['done'],
}

// One page of the landlord's jobs. Pending comes first because that is the first status,
// then newest. The next page starts after the last row, so the list never downloads every job.
export async function fetchLandlordJobs({ cursor, status, unit, urgentOnly }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const landlordId = sessionData.session?.user?.id
  if (!landlordId) throw new Error('Please sign in again.')

  const unitSearch = unit?.trim() ?? ''
  const statuses = STATUS_GROUPS[status] ?? null
  const unitColumn = unitSearch
    ? 'unit:units!inner(label)'
    : 'unit:units!jobs_unit_id_fkey(label)'

  let query = supabase
    .from('jobs')
    .select(
      [
        'id',
        'category',
        'description',
        'status',
        'is_urgent',
        'created_at',
        'photo_path',
        'provider_id',
        unitColumn,
        'tenant:profiles!jobs_tenant_id_fkey(full_name, phone)',
      ].join(', '),
    )
    .eq('landlord_id', landlordId)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (statuses) query = query.in('status', statuses)
  if (urgentOnly) query = query.eq('is_urgent', true)
  if (unitSearch) query = query.ilike('units.label', '%' + escapeLike(unitSearch) + '%')
  if (cursor) query = query.or(olderThan(cursor))

  const { data, error } = await query
  if (error) throw new Error('Jobs could not be loaded. Please try again.')

  const page = (data ?? []).slice(0, PAGE_SIZE).map(mapJob)
  const last = page[page.length - 1]
  const hasMore = (data ?? []).length > PAGE_SIZE
  return {
    rows: page,
    nextCursor: hasMore && last
      ? { status: last.status, createdAt: last.createdAt, id: last.id }
      : null,
  }
}

// One job for the details screen. The landlord only receives his own row.
export async function fetchLandlordJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      [
        'id',
        'category',
        'description',
        'status',
        'is_urgent',
        'photo_path',
        'proof_photo_path',
        'unit:units!jobs_unit_id_fkey(label)',
        'tenant:profiles!jobs_tenant_id_fkey(full_name, phone)',
        'provider:profiles!jobs_provider_id_fkey(id, full_name, phone, trade)',
        'events:job_events(id, to_status, created_at, note)',
      ].join(', '),
    )
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw new Error('This job could not be loaded. Please try again.')
  if (!data) return null

  const unit = first(data.unit)
  const tenant = first(data.tenant)
  const provider = first(data.provider)
  const events = (Array.isArray(data.events) ? data.events : [])
    .map((event) => ({
      id: event.id,
      toStatus: event.to_status,
      createdAt: event.created_at,
      note: event.note ?? '',
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)))

  return {
    id: data.id,
    category: data.category,
    description: data.description ?? '',
    status: data.status,
    urgent: data.is_urgent === true,
    photoPath: data.photo_path ?? '',
    proofPath: data.proof_photo_path ?? '',
    unitLabel: unit?.label ?? '',
    tenantName: tenant?.full_name ?? '',
    tenantPhone: tenant?.phone ?? '',
    providerId: provider?.id ?? null,
    provider: provider
      ? {
          id: provider.id,
          name: provider.full_name ?? '',
          phone: provider.phone ?? '',
          trade: tradeLabel(provider.trade),
        }
      : null,
    events,
  }
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function mapJob(row) {
  const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit
  const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant
  return {
    id: row.id,
    category: row.category,
    description: row.description ?? '',
    status: row.status,
    urgent: row.is_urgent === true,
    createdAt: row.created_at,
    photoPath: row.photo_path,
    unitLabel: unit?.label ?? '',
    tenantName: tenant?.full_name ?? '',
    tenantPhone: tenant?.phone ?? '',
    providerId: row.provider_id ?? null,
  }
}

function olderThan(cursor) {
  const createdAt = `"${cursor.createdAt}"`
  const id = `"${cursor.id}"`
  return [
    `status.gt.${cursor.status}`,
    `and(status.eq.${cursor.status},created_at.lt.${createdAt})`,
    `and(status.eq.${cursor.status},created_at.eq.${createdAt},id.lt.${id})`,
  ].join(',')
}

function escapeLike(value) {
  return value.replace(/[%_\\]/g, '\\$&')
}

// The update matched nothing because the job was no longer pending.
export class AlreadyAssignedError extends Error {
  constructor() {
    super('This job was already assigned')
    this.name = 'AlreadyAssignedError'
  }
}

// The update matched nothing because the job or its provider changed first.
export class JobChangedError extends Error {
  constructor() {
    super('This job already changed. Refresh to see it.')
    this.name = 'JobChangedError'
  }
}

// Moves a pending job to assigned. A second click, or another tab, changes no row.
export async function assignProvider({ jobId, providerId }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const landlordId = sessionData.session?.user?.id
  if (!landlordId) throw new Error('Please sign in again.')

  const { data, error } = await supabase
    .from('jobs')
    .update({ provider_id: providerId, status: 'assigned' })
    .eq('id', jobId)
    .eq('landlord_id', landlordId)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error('This job could not be assigned. Please try again.')
  if (data?.length !== 1) throw new AlreadyAssignedError()
  return data[0]
}

// Switches the provider while the job is still assigned to the same person.
export async function reassignProvider({ jobId, providerId, previousProviderId }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const landlordId = sessionData.session?.user?.id
  if (!landlordId) throw new Error('Please sign in again.')
  if (!previousProviderId) throw new Error('This job could not be reassigned. Please try again.')

  const { data, error } = await supabase
    .from('jobs')
    .update({ provider_id: providerId })
    .eq('id', jobId)
    .eq('landlord_id', landlordId)
    .eq('status', 'assigned')
    .eq('provider_id', previousProviderId)
    .select('id')

  if (error) throw new Error(reassignErrorMessage(error))
  if (data?.length !== 1) throw new JobChangedError()
  return data[0]
}

function reassignErrorMessage(error) {
  const message = error?.message ?? ''
  if (message.includes('Choose one of your own providers')) return 'Choose one of your own providers.'
  if (message.includes('only change the provider while the job is assigned')) {
    return 'You can only change the provider while the job is assigned.'
  }
  return 'This job could not be reassigned. Please try again.'
}

// Providers this landlord invited. Tenants are left out.
export async function fetchProviders() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, trade')
    .eq('role', 'provider')
    .order('full_name')

  if (error) throw new Error('Providers could not be loaded. Please try again.')
  return data ?? []
}

// One database call. The dashboard must not download every job just to count it.
export async function fetchLandlordStats() {
  const { data, error } = await supabase.rpc('landlord_stats')
  if (error) throw new Error('The counts could not be loaded. Please try again.')

  const row = Array.isArray(data) ? data[0] : data
  return {
    newJobs: Number(row?.new_jobs ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    doneThisMonth: Number(row?.done_this_month ?? 0),
  }
}

export const TRADES = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'appliance repair', label: 'Appliance repair' },
  { value: 'general', label: 'General' },
]

export function tradeLabel(trade) {
  return TRADES.find((item) => item.value === trade)?.label ?? trade ?? ''
}

// The landlord's buildings, flats, and the people he invited.
export async function fetchPeople() {
  const [properties, units, profiles] = await Promise.all([
    supabase.from('properties').select('id, name').order('name'),
    supabase.from('units').select('id, label, property_id').order('label'),
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, unit_id, trade')
      .in('role', ['tenant', 'provider'])
      .order('full_name'),
  ])

  if (properties.error || units.error || profiles.error) {
    throw new Error('People could not be loaded. Please try again.')
  }

  const rows = profiles.data ?? []
  return {
    properties: properties.data ?? [],
    units: units.data ?? [],
    tenants: rows.filter((person) => person.role === 'tenant'),
    providers: rows.filter((person) => person.role === 'provider'),
  }
}

export async function addUnit({ propertyId, label }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const landlordId = sessionData.session?.user?.id
  if (!landlordId) throw new Error('Please sign in again.')

  const { error } = await supabase.from('units').insert({
    property_id: propertyId,
    landlord_id: landlordId,
    label: label.trim(),
  })
  if (error) throw new Error('The unit could not be added. Please try again.')
}

// Sends the invite through the Edge Function. The browser never uses the service role key.
export async function invitePerson(body) {
  const { data, error } = await supabase.functions.invoke('invite-user', { body })
  if (error) throw new Error(await inviteErrorMessage(error))
  if (!data?.id) throw new Error('The invite could not be sent. Please try again.')
  return data
}

async function inviteErrorMessage(error) {
  const context = error?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json()
      if (typeof body?.error === 'string' && body.error) return body.error
    } catch {
      // The response body can only be read once.
    }
  }
  if (typeof context?.error === 'string' && context.error) return context.error
  return 'The invite could not be sent. Please try again.'
}
