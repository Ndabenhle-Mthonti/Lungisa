// Landlord edits or removes a tenant or provider.
// The service role key stays in the function secrets. The browser never sees it.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BODY_CHARS = 4000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS })
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Use POST to update someone.' })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) {
    console.error('Manage person is missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.')
    return json(500, { error: 'People cannot be changed right now.' })
  }

  const jwt = bearerToken(request)
  if (!jwt) return json(401, { error: 'Please sign in again.' })

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + jwt } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await caller.auth.getUser(jwt)
  if (userError || !userData.user) return json(401, { error: 'Please sign in again.' })

  const { data: landlord, error: landlordError } = await caller
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (landlordError || !landlord || landlord.role !== 'landlord') {
    return json(403, { error: 'Only a landlord can change someone.' })
  }

  const parsed = await readBody(request)
  if (!parsed.ok) return json(400, { error: parsed.error })

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: person, error: personError } = await admin
    .from('profiles')
    .select('id, role, landlord_id, email')
    .eq('id', parsed.value.personId)
    .maybeSingle()
  if (personError) {
    console.error('Person lookup failed', personError.code)
    return json(500, { error: 'This person could not be loaded. Please try again.' })
  }
  if (!person || person.landlord_id !== landlord.id || (person.role !== 'tenant' && person.role !== 'provider')) {
    return json(404, { error: 'That person is not on your list.' })
  }

  if (parsed.value.action === 'remove') {
    const { error: removeError } = await caller.rpc('remove_landlord_person', {
      p_person: person.id,
    })
    if (removeError) {
      console.error('Remove failed', removeError.code, removeError.message)
      return json(500, { error: removeFailureMessage(removeError.message) })
    }
    return json(200, { id: person.id })
  }

  const next = parsed.value
  const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(person.id)
  if (authLookupError || !authUser.user) {
    console.error('Auth lookup failed', authLookupError?.code)
    return json(500, { error: 'The details could not be saved. Please try again.' })
  }

  const currentEmail = (person.email || authUser.user.email || '').toLowerCase()
  const emailChanged = next.email !== currentEmail
  if (emailChanged) {
    const { error: emailError } = await admin.auth.admin.updateUserById(person.id, {
      email: next.email,
      email_confirm: true,
    })
    if (emailError) return json(emailStatus(emailError), { error: emailMessage(emailError) })
  }

  const { error: saveError } = await admin
    .from('profiles')
    .update({
      full_name: next.fullName,
      phone: next.phone,
      email: next.email,
    })
    .eq('id', person.id)
    .eq('landlord_id', landlord.id)
  if (saveError) {
    console.error('Profile update failed', saveError.code)
    if (emailChanged) {
      await admin.auth.admin.updateUserById(person.id, {
        email: currentEmail,
        email_confirm: true,
      })
    }
    return json(500, { error: 'The details could not be saved. Please try again.' })
  }

  return json(200, { id: person.id })
})

function bearerToken(request: Request) {
  const header = request.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? ''
}

type UpdateBody = {
  action: 'update'
  personId: string
  fullName: string
  phone: string
  email: string
}

type RemoveBody = {
  action: 'remove'
  personId: string
}

async function readBody(
  request: Request,
): Promise<{ ok: true, value: UpdateBody | RemoveBody } | { ok: false, error: string }> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return { ok: false, error: 'That request is too large.' }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Send the change as JSON.' }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the change as a JSON object.' }
  }

  const record = body as Record<string, unknown>
  const action = record.action
  if (action !== 'update' && action !== 'remove') {
    return { ok: false, error: 'Choose edit or remove.' }
  }

  const allowed = action === 'remove'
    ? ['action', 'person_id']
    : ['action', 'person_id', 'full_name', 'phone', 'email']
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return { ok: false, error: 'That request has a field that is not allowed.' }
  }

  if (typeof record.person_id !== 'string' || !UUID_PATTERN.test(record.person_id)) {
    return { ok: false, error: 'Choose a person from your list.' }
  }
  const personId = record.person_id.toLowerCase()
  if (action === 'remove') return { ok: true, value: { action, personId } }

  const fullName = requiredText(record.full_name, 'Enter a name.')
  if (!fullName.ok) return fullName
  if (fullName.value.length > 80) return { ok: false, error: 'The name is too long.' }

  const phone = requiredText(record.phone, 'Enter a phone number.')
  if (!phone.ok) return phone
  const digits = phone.value.replace(/\D/g, '')
  if (!PHONE_PATTERN.test(phone.value) || digits.length < 7) {
    return { ok: false, error: 'Enter a valid phone number.' }
  }

  const email = requiredText(record.email, 'Enter an email.')
  if (!email.ok) return email
  if (email.value.length > 320 || !EMAIL_PATTERN.test(email.value)) {
    return { ok: false, error: 'Enter a valid email.' }
  }

  return {
    ok: true,
    value: {
      action: 'update',
      personId,
      fullName: fullName.value,
      phone: phone.value,
      email: email.value.toLowerCase(),
    },
  }
}

function requiredText(
  value: unknown,
  message: string,
): { ok: true, value: string } | { ok: false, error: string } {
  if (typeof value !== 'string') return { ok: false, error: message }
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, error: message }
  return { ok: true, value: trimmed }
}

function removeFailureMessage(message: string | undefined) {
  const text = (message ?? '').toLowerCase()
  if (text.includes('could not find the function') || text.includes('schema cache')) {
    return 'The database update has not been applied yet. Run it, then try again.'
  }
  if (text.includes('operator does not exist')) {
    return 'The database update needs to be run again, then try Remove.'
  }
  return 'This person could not be removed. Please try again.'
}

function emailStatus(error: { message?: string, code?: string, status?: number }) {
  const message = (error.message ?? '').toLowerCase()
  const code = (error.code ?? '').toLowerCase()
  if (code === 'email_exists' || message.includes('already')) return 409
  return 500
}

function emailMessage(error: { message?: string, code?: string, status?: number }) {
  if (emailStatus(error) === 409) return 'That email already has an account.'
  return 'The email could not be changed. Please try again.'
}

function json(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}
