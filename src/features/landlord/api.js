import { supabase } from '../../lib/supabaseClient.js'

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
