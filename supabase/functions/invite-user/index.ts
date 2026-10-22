// Landlord-only invite. The service role key is read from Edge Function secrets.
// It is never written in this file and never returned to the caller.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_INVITES_PER_HOUR = 20
const HOUR_MS = 60 * 60 * 1000
const MAX_BODY_CHARS = 4000

const ALLOWED_FIELDS = new Set(['email', 'full_name', 'phone', 'role', 'unit_id', 'trade'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/

type InviteRole = 'tenant' | 'provider'

type InviteBody = {
  email: string
  full_name: string
  phone: string
  role: InviteRole
  unit_id: string | null
  trade: string | null
}

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
    return json(405, { error: 'Use POST to invite someone.' })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) {
    console.error('Invite function is missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.')
    return json(500, { error: 'Invites are not available right now.' })
  }

  const jwt = bearerToken(request)
  if (!jwt) return json(401, { error: 'Please sign in again.' })

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + jwt } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await caller.auth.getUser(jwt)
  if (userError || !userData.user) return json(401, { error: 'Please sign in again.' })

  const { data: profile, error: profileError } = await caller
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError || !profile || profile.role !== 'landlord') {
    return json(403, { error: 'Only a landlord can invite someone.' })
  }

  const parsed = await readBody(request)
  if (!parsed.ok) return json(400, { error: parsed.error })
  const invite = parsed.value

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (invite.role === 'tenant') {
    const unitId = invite.unit_id
    if (!unitId) return json(400, { error: 'Choose a flat for this tenant.' })
    const { data: unit, error: unitError } = await admin
      .from('units')
      .select('id')
      .eq('id', unitId)
      .eq('landlord_id', profile.id)
      .maybeSingle()
    if (unitError) {
      console.error('Unit check failed', unitError.code)
      return json(500, { error: 'The flat could not be checked. Please try again.' })
    }
    if (!unit) return json(400, { error: 'Choose one of your own flats.' })

    const { data: occupant, error: occupantError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'tenant')
      .eq('unit_id', unitId)
      .limit(1)
    if (occupantError) {
      console.error('Occupant check failed', occupantError.code)
      return json(500, { error: 'The flat could not be checked. Please try again.' })
    }
    if (occupant && occupant.length > 0) {
      return json(409, { error: 'That flat already has a tenant. Remove them before inviting someone new.' })
    }
  }

  const since = new Date(Date.now() - HOUR_MS).toISOString()
  const { count, error: countError } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('landlord_id', profile.id)
    .gte('created_at', since)
  if (countError || count === null) {
    console.error('Invite count failed', countError?.code)
    return json(500, { error: 'Invites could not be checked. Please try again.' })
  }
  if (count >= MAX_INVITES_PER_HOUR) {
    return json(429, { error: 'You can send 20 invites an hour. Try again later.' })
  }

  const redirectTo = passwordPageUrl(request)
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    invite.email,
    redirectTo ? { redirectTo } : undefined,
  )
  if (inviteError || !invited?.user) {
    return json(inviteStatus(inviteError), { error: inviteMessage(inviteError) })
  }

  const userId = invited.user.id
  const { error: insertError } = await admin.from('profiles').insert({
    id: userId,
    role: invite.role,
    full_name: invite.full_name,
    phone: invite.phone,
    email: invite.email,
    landlord_id: profile.id,
    unit_id: invite.unit_id,
    trade: invite.trade,
  })
  if (insertError) {
    console.error('Profile insert failed', insertError.code)
    await removeInvitedUser(admin, userId)
    return json(500, { error: 'The invite could not be saved. Please try again.' })
  }

  const { error: logError } = await admin.from('invites').insert({
    email: invite.email,
    role: invite.role,
    landlord_id: profile.id,
    unit_id: invite.unit_id,
    trade: invite.trade,
  })
  if (logError) {
    console.error('Invite log failed', logError.code)
    await removeInvitedUser(admin, userId)
    return json(500, { error: 'The invite could not be saved. Please try again.' })
  }

  return json(200, { id: userId, email: invite.email, role: invite.role })
})

function bearerToken(request: Request) {
  const header = request.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? ''
}

async function readBody(request: Request): Promise<{ ok: true, value: InviteBody } | { ok: false, error: string }> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return { ok: false, error: 'That invite is too large.' }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Send the invite as JSON.' }
  }
  return parseInvite(body)
}

// Rejects unknown fields, the wrong types, and a tenant/provider field on the wrong role.
function parseInvite(body: unknown): { ok: true, value: InviteBody } | { ok: false, error: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Send the invite as a JSON object.' }
  }

  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { ok: false, error: 'That request has a field that is not allowed.' }
    }
  }

  const email = requiredText(record.email, 'Enter an email.')
  if (!email.ok) return email
  if (email.value.length > 320 || !EMAIL_PATTERN.test(email.value)) {
    return { ok: false, error: 'Enter a valid email.' }
  }

  const fullName = requiredText(record.full_name, 'Enter the person\'s name.')
  if (!fullName.ok) return fullName
  if (fullName.value.length > 80) return { ok: false, error: 'The name is too long.' }

  const phone = requiredText(record.phone, 'Enter a phone number.')
  if (!phone.ok) return phone
  const digits = phone.value.replace(/\D/g, '')
  if (!PHONE_PATTERN.test(phone.value) || digits.length < 7) {
    return { ok: false, error: 'Enter a valid phone number.' }
  }

  if (record.role !== 'tenant' && record.role !== 'provider') {
    return { ok: false, error: 'Choose tenant or provider.' }
  }
  const role: InviteRole = record.role

  if (role === 'tenant') {
    if ('trade' in record) return { ok: false, error: 'A tenant invite cannot include a trade.' }
    if (typeof record.unit_id !== 'string' || !UUID_PATTERN.test(record.unit_id)) {
      return { ok: false, error: 'Choose a flat for this tenant.' }
    }
    return {
      ok: true,
      value: {
        email: email.value.toLowerCase(),
        full_name: fullName.value,
        phone: phone.value,
        role,
        unit_id: record.unit_id.toLowerCase(),
        trade: null,
      },
    }
  }

  if ('unit_id' in record) return { ok: false, error: 'A provider invite cannot include a flat.' }
  const trade = requiredText(record.trade, 'Enter a trade for this provider.')
  if (!trade.ok) return trade
  if (trade.value.length > 40) return { ok: false, error: 'The trade is too long.' }

  return {
    ok: true,
    value: {
      email: email.value.toLowerCase(),
      full_name: fullName.value,
      phone: phone.value,
      role,
      unit_id: null,
      trade: trade.value,
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

// New invites open the password page on the same site the landlord is using.
// INVITE_REDIRECT_URL still wins when it is set, so a fixed live address can be used.
function passwordPageUrl(request: Request) {
  const configured = configuredRedirect()
  if (configured) return configured
  const origin = request.headers.get('origin') ?? ''
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return ''
    if (url.username || url.password) return ''
    return url.origin + '/reset-password'
  } catch {
    return ''
  }
}

function configuredRedirect() {
  const value = Deno.env.get('INVITE_REDIRECT_URL')?.trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function inviteStatus(error: { message?: string, code?: string, status?: number } | null) {
  const message = (error?.message ?? '').toLowerCase()
  const code = (error?.code ?? '').toLowerCase()
  if (code === 'email_exists' || message.includes('already')) return 409
  if (error?.status === 429 || message.includes('rate limit')) return 429
  return 500
}

function inviteMessage(error: { message?: string, code?: string, status?: number } | null) {
  const status = inviteStatus(error)
  if (status === 409) return 'That email already has an account.'
  if (status === 429) return 'Too many invite emails were sent. Try again later.'
  return 'The invite email could not be sent. Please try again.'
}

function json(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

// Deletes the auth user. The profile row is removed with it.
async function removeInvitedUser(admin: ReturnType<typeof createClient>, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) console.error('Could not remove the unfinished invite', error.code)
}
