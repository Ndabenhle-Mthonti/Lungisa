import { createClient } from '@supabase/supabase-js'

// Logs in as the seeded users with the anon key only.
// The service role key is never read. A check passes when the action is blocked.

const PASSWORD = 'LungisaDev123'
const OTHER_LANDLORD_ID = '00000000-0000-0000-0000-000000000001'

const ACCOUNTS = {
  landlord: 'thandi@seed.lungisa.test',
  tenantA: 'lerato@seed.lungisa.test',
  tenantB: 'nokuthula@seed.lungisa.test',
  providerA: 'sipho@seed.lungisa.test',
  providerB: 'themba@seed.lungisa.test',
}

const { url, anonKey } = readEnv()
const results = []

function readEnv() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const missing = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (missing.length > 0) {
    console.error('Missing ' + missing.join(', ') + '.')
    console.error('Put them in .env.local, then run: npm run security:check')
    process.exit(1)
  }
  return { url, anonKey }
}

function userClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function record(name, pass, detail) {
  results.push({ name, pass })
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + ' — ' + detail)
}

async function signIn(email) {
  const client = userClient()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
  if (error || !data.user) {
    console.error('Sign in failed for ' + email + ': ' + (error?.message ?? 'no user'))
    process.exit(1)
  }
  return { client, id: data.user.id, email }
}

async function rowsOf(client, table, filter) {
  let query = client.from(table).select('id')
  if (filter) query = filter(query)
  const { data, error } = await query
  return { data: data ?? [], error }
}

function blockedWrite(error, data) {
  if (error) return true
  return !data || data.length === 0
}

async function main() {
  const landlord = await signIn(ACCOUNTS.landlord)
  const tenantA = await signIn(ACCOUNTS.tenantA)
  const tenantB = await signIn(ACCOUNTS.tenantB)
  const providerA = await signIn(ACCOUNTS.providerA)
  const providerB = await signIn(ACCOUNTS.providerB)

  const { data: jobs, error: jobsError } = await landlord.client
    .from('jobs')
    .select('id, tenant_id, provider_id, status, landlord_id')
  if (jobsError || !jobs || jobs.length === 0) {
    console.error('The landlord could not read seed jobs. Run scripts/seed.mjs first.')
    process.exit(1)
  }

  const { data: profiles, error: profilesError } = await landlord.client
    .from('profiles')
    .select('id, role, unit_id, landlord_id, full_name')
  if (profilesError || !profiles) {
    console.error('The landlord could not read profiles.')
    process.exit(1)
  }

  const tenantAProfile = profiles.find((row) => row.id === tenantA.id)
  const pendingJob = jobs.find((job) => job.status === 'pending' && job.provider_id == null)
  const otherProviderJob = jobs.find((job) => job.provider_id === providerB.id)
  const tenantAJob = jobs.find((job) => job.tenant_id === tenantA.id)

  await checkTenantCannotReadOtherTenant(tenantA, tenantB)
  await checkTenantCannotReadProviders(tenantA)
  await checkTenantLandlordStats(tenantA)
  await checkProviderUnassigned(providerA)
  await checkProviderCannotAssignSelf(landlord, providerA, pendingJob)
  await checkProviderCannotUpdateOther(landlord, providerA, otherProviderJob)
  await checkEmptyPhoto(tenantA, tenantAProfile, landlord.id)
  await checkOtherTenantId(tenantA, tenantB, tenantAProfile, landlord.id)
  await checkTenantCannotUpdateStatus(landlord, tenantA, tenantAJob)
  await checkOtherLandlord(landlord, 'Landlord')
  await checkOtherLandlord(tenantA, 'Tenant A')
  await checkOtherLandlord(tenantB, 'Tenant B')
  await checkOtherLandlord(providerA, 'Provider A')
  await checkOtherLandlord(providerB, 'Provider B')

  const doneJobs = jobs.filter((job) => job.status === 'done')
  const tenantADone = doneJobs.find((job) => job.tenant_id === tenantA.id)
  const tenantBDone = doneJobs.find((job) => job.tenant_id === tenantB.id)
  const providerADone = doneJobs.find((job) => job.provider_id === providerA.id)

  await checkReopenWithoutNote(landlord, tenantA, tenantADone)
  await checkReopenChangesAnotherColumn(landlord, tenantA, tenantADone)
  await checkReopenOtherTenant(landlord, tenantA, tenantBDone)
  await checkLandlordCannotReopen(landlord, tenantADone ?? tenantBDone)
  await checkProviderCannotReopen(landlord, providerA, providerADone)
  await checkTenantCanReopen(landlord, tenantA, tenantADone)

  const assignedToA = jobs.find((job) => job.status === 'assigned' && job.provider_id === providerA.id)
  const assignedJob = assignedToA ?? jobs.find((job) => job.status === 'assigned' && job.provider_id)
  const onTheWayJob = jobs.find((job) => job.status === 'on_the_way' && job.provider_id)
  await checkLandlordCannotReassignOnTheWay(landlord, providerA, providerB, onTheWayJob)
  await checkLandlordCannotReassignToOtherProvider(landlord, tenantA, assignedJob)
  await checkProviderCannotReassign(landlord, providerA, providerB, assignedToA)
  await checkTenantCannotReassign(landlord, tenantA, tenantAJob)
  await checkLandlordCanReassign(landlord, providerA, providerB, profiles, assignedJob)

  const failed = results.filter((result) => !result.pass)
  console.log('')
  if (failed.length === 0) {
    console.log(results.length + ' checks passed.')
    process.exit(0)
  }
  console.log(failed.length + ' of ' + results.length + ' checks failed.')
  process.exit(1)
}

async function checkTenantCannotReadOtherTenant(tenantA, tenantB) {
  const { data, error } = await rowsOf(tenantA.client, 'jobs', (query) =>
    query.eq('tenant_id', tenantB.id),
  )
  if (error) {
    record('Tenant A reads tenant B\'s jobs', true, 'error: ' + error.message)
    return
  }
  record(
    'Tenant A reads tenant B\'s jobs',
    data.length === 0,
    data.length === 0 ? '0 rows' : data.length + ' rows',
  )
}

async function checkTenantCannotReadProviders(tenantA) {
  const { data, error } = await tenantA.client
    .from('profiles')
    .select('id, role')
    .eq('role', 'provider')
  if (error) {
    record('Tenant reads the provider list', true, 'error: ' + error.message)
    return
  }
  const rows = data ?? []
  record(
    'Tenant reads the provider list',
    rows.length === 0,
    rows.length === 0 ? '0 rows' : rows.length + ' rows',
  )
}

async function checkTenantLandlordStats(tenantA) {
  const { data, error } = await tenantA.client.rpc('landlord_stats')
  if (error) {
    record('Tenant calls landlord_stats()', true, 'error: ' + error.message)
    return
  }
  const rows = Array.isArray(data) ? data : data ? [data] : []
  const empty =
    rows.length === 0 ||
    rows.every((row) =>
      ['new_jobs', 'in_progress', 'done_this_month'].every((key) => Number(row[key] ?? 0) === 0),
    )
  record(
    'Tenant calls landlord_stats()',
    empty,
    empty ? 'nothing' : 'returned counts',
  )
}

async function checkProviderUnassigned(providerA) {
  const { data, error } = await rowsOf(providerA.client, 'jobs', (query) =>
    query.is('provider_id', null),
  )
  if (error) {
    record('Provider reads unassigned jobs', true, 'error: ' + error.message)
    return
  }
  record(
    'Provider reads unassigned jobs',
    data.length === 0,
    data.length === 0 ? '0 rows' : data.length + ' rows',
  )
}

async function checkProviderCannotAssignSelf(landlord, providerA, pendingJob) {
  const name = 'Provider assigns himself to a job'
  if (!pendingJob) {
    record(name, false, 'no unassigned seed job to try')
    return
  }
  const before = await landlordJob(landlord, pendingJob.id)
  const { data, error } = await providerA.client
    .from('jobs')
    .update({ status: 'assigned', provider_id: providerA.id })
    .eq('id', pendingJob.id)
    .select('id, status, provider_id')
  const after = await landlordJob(landlord, pendingJob.id)
  const unchanged =
    after &&
    after.status === before.status &&
    after.provider_id === before.provider_id
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkProviderCannotUpdateOther(landlord, providerA, otherJob) {
  const name = 'Provider updates another provider\'s job'
  if (!otherJob) {
    record(name, false, 'no job assigned to the other provider')
    return
  }
  const before = await landlordJob(landlord, otherJob.id)
  const { data, error } = await providerA.client
    .from('jobs')
    .update({ status: 'on_the_way' })
    .eq('id', otherJob.id)
    .select('id, status')
  const after = await landlordJob(landlord, otherJob.id)
  const unchanged = after && after.status === before.status
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkEmptyPhoto(tenantA, profile, landlordId) {
  const name = 'Tenant inserts a job with an empty photo'
  if (!profile?.unit_id) {
    record(name, false, 'tenant A has no unit')
    return
  }
  const { data, error } = await tenantA.client
    .from('jobs')
    .insert({
      landlord_id: landlordId,
      unit_id: profile.unit_id,
      tenant_id: tenantA.id,
      category: 'plumbing',
      description: 'Security check: empty photo',
      photo_path: '',
      status: 'pending',
    })
    .select('id')
  record(name, blockedWrite(error, data), blockedWrite(error, data) ? blockedDetail(error) : 'a row was created')
}

async function checkOtherTenantId(tenantA, tenantB, profile, landlordId) {
  const name = 'Tenant inserts a job with another tenant\'s id'
  if (!profile?.unit_id) {
    record(name, false, 'tenant A has no unit')
    return
  }
  const { data, error } = await tenantA.client
    .from('jobs')
    .insert({
      landlord_id: landlordId,
      unit_id: profile.unit_id,
      tenant_id: tenantB.id,
      category: 'plumbing',
      description: 'Security check: other tenant',
      photo_path: 'seed/placeholder.jpg',
      status: 'pending',
    })
    .select('id')
  record(name, blockedWrite(error, data), blockedWrite(error, data) ? blockedDetail(error) : 'a row was created')
}

async function checkTenantCannotUpdateStatus(landlord, tenantA, job) {
  const name = 'Tenant updates a job\'s status'
  if (!job) {
    record(name, false, 'tenant A has no job')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await tenantA.client
    .from('jobs')
    .update({ status: 'assigned' })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = after && after.status === before.status
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

// Asks for rows owned by a landlord id that is not in the seed.
// A tenant or provider must also get nothing from the real landlord's buildings.
async function checkOtherLandlord(user, label) {
  const name = label + ' reads another landlord\'s data'
  const tables = ['jobs', 'properties', 'units', 'invites', 'profiles']
  const leaked = []
  for (const table of tables) {
    const { data, error } = await rowsOf(user.client, table, (query) =>
      query.eq('landlord_id', OTHER_LANDLORD_ID),
    )
    if (!error && data.length > 0) leaked.push(table)
  }
  if (label !== 'Landlord') {
    const { data, error } = await rowsOf(user.client, 'properties')
    if (!error && data.length > 0) leaked.push('properties')
  }
  record(name, leaked.length === 0, leaked.length === 0 ? '0 rows' : leaked.join(', ') + ' returned rows')
}

async function checkReopenWithoutNote(landlord, tenant, job) {
  const name = 'Tenant reopens a finished job without a note'
  if (!job) {
    record(name, false, 'no finished job for this tenant')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await tenant.client
    .from('jobs')
    .update({ status: 'assigned' })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = sameJob(before, after)
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkReopenChangesAnotherColumn(landlord, tenant, job) {
  const name = 'Tenant reopens a job and changes another column'
  if (!job) {
    record(name, false, 'no finished job for this tenant')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await tenant.client
    .from('jobs')
    .update({
      status: 'assigned',
      reopen_note: 'Still broken after the visit',
      description: 'Security check changed the description',
    })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = sameJob(before, after) && after.description === before.description
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkReopenOtherTenant(landlord, tenant, job) {
  const name = 'Tenant reopens another tenant\'s job'
  if (!job) {
    record(name, false, 'no finished job for the other tenant')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await tenant.client
    .from('jobs')
    .update({ status: 'assigned', reopen_note: 'Still broken after the visit' })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = sameJob(before, after)
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkLandlordCannotReopen(landlord, job) {
  const name = 'Landlord moves a job from done to assigned'
  if (!job) {
    record(name, false, 'no finished job to try')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await landlord.client
    .from('jobs')
    .update({ status: 'assigned' })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = sameJob(before, after)
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

async function checkProviderCannotReopen(landlord, provider, job) {
  const name = 'Provider moves a job from done to assigned'
  if (!job) {
    record(name, false, 'no finished job for this provider')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await provider.client
    .from('jobs')
    .update({ status: 'assigned' })
    .eq('id', job.id)
    .select('id, status')
  const after = await landlordJob(landlord, job.id)
  const unchanged = sameJob(before, after)
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the job changed')
}

// A passing run uses one of tenant A's finished jobs. Seed again if none remain.
async function checkTenantCanReopen(landlord, tenant, job) {
  const name = 'Tenant reopens his own finished job with a note'
  if (!job) {
    record(name, false, 'no finished job for this tenant')
    return
  }
  const before = await landlordJob(landlord, job.id)
  if (!before || before.status !== 'done') {
    record(name, false, 'the finished job was already changed')
    return
  }
  const note = 'Still broken after the visit'
  const { data, error } = await tenant.client
    .from('jobs')
    .update({ status: 'assigned', reopen_note: note })
    .eq('id', job.id)
    .select('id, status, provider_id, proof_photo_path, reopen_count, reopen_note, photo_path')
  const after = await landlordJob(landlord, job.id)
  const { data: events, error: eventsError } = await landlord.client
    .from('job_events')
    .select('note, from_status, to_status')
    .eq('job_id', job.id)
    .eq('from_status', 'done')
    .eq('to_status', 'assigned')
    .order('created_at', { ascending: false })
    .limit(1)
  const event = events?.[0]
  const pass =
    !error &&
    data?.length === 1 &&
    after &&
    after.status === 'assigned' &&
    after.provider_id === before.provider_id &&
    after.photo_path === before.photo_path &&
    after.description === before.description &&
    after.proof_photo_path == null &&
    after.reopen_count === before.reopen_count + 1 &&
    after.reopen_note === note &&
    !eventsError &&
    event?.from_status === 'done' &&
    event?.to_status === 'assigned' &&
    event?.note === 'Previous proof: ' + (before.proof_photo_path ?? '')
  record(name, pass, pass ? 'sent back to the same provider' : error?.message ?? 'the job was not sent back')
}

async function checkLandlordCannotReassignOnTheWay(landlord, providerA, providerB, job) {
  const name = 'Landlord reassigns a job that is on the way'
  if (!job) {
    record(name, false, 'no job that is on the way')
    return
  }
  const nextProvider = job.provider_id === providerA.id ? providerB.id : providerA.id
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await landlord.client
    .from('jobs')
    .update({ provider_id: nextProvider })
    .eq('id', job.id)
    .select('id, status, provider_id')
  const after = await landlordJob(landlord, job.id)
  const unchanged = after && after.status === before.status && after.provider_id === before.provider_id
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the provider changed')
}

async function checkLandlordCannotReassignToOtherProvider(landlord, tenant, job) {
  const name = 'Landlord reassigns to another landlord\'s provider'
  if (!job) {
    record(name, false, 'no assigned job to try')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await landlord.client
    .from('jobs')
    .update({ provider_id: tenant.id })
    .eq('id', job.id)
    .select('id, status, provider_id')
  const after = await landlordJob(landlord, job.id)
  const unchanged = after && after.status === before.status && after.provider_id === before.provider_id
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the provider changed')
}

async function checkProviderCannotReassign(landlord, providerA, providerB, job) {
  const name = 'Provider reassigns a job'
  if (!job || job.provider_id !== providerA.id) {
    record(name, false, 'no job assigned to provider A')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await providerA.client
    .from('jobs')
    .update({ provider_id: providerB.id })
    .eq('id', job.id)
    .select('id, status, provider_id')
  const after = await landlordJob(landlord, job.id)
  const unchanged = after && after.status === before.status && after.provider_id === before.provider_id
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the provider changed')
}

async function checkTenantCannotReassign(landlord, tenant, job) {
  const name = 'Tenant reassigns a job'
  if (!job) {
    record(name, false, 'tenant A has no job')
    return
  }
  const before = await landlordJob(landlord, job.id)
  const { data, error } = await tenant.client
    .from('jobs')
    .update({ provider_id: tenant.id })
    .eq('id', job.id)
    .select('id, provider_id')
  const after = await landlordJob(landlord, job.id)
  const unchanged = after && after.provider_id === before.provider_id
  const pass = blockedWrite(error, data) && unchanged
  record(name, pass, pass ? blockedDetail(error) : 'the provider changed')
}

async function checkLandlordCanReassign(landlord, providerA, providerB, profiles, job) {
  const name = 'Landlord reassigns an assigned job to his own provider'
  if (!job || job.status !== 'assigned' || !job.provider_id) {
    record(name, false, 'no assigned job to try')
    return
  }
  const next = job.provider_id === providerA.id ? providerB : providerA
  const oldName = profiles.find((row) => row.id === job.provider_id)?.full_name || 'Unknown'
  const newName = profiles.find((row) => row.id === next.id)?.full_name || 'Unknown'
  const before = await landlordJob(landlord, job.id)
  if (!before || before.status !== 'assigned') {
    record(name, false, 'the assigned job was already changed')
    return
  }
  const { data, error } = await landlord.client
    .from('jobs')
    .update({ provider_id: next.id })
    .eq('id', job.id)
    .eq('status', 'assigned')
    .eq('provider_id', before.provider_id)
    .select('id, status, provider_id')
  const after = await landlordJob(landlord, job.id)
  const { data: events, error: eventsError } = await landlord.client
    .from('job_events')
    .select('note, from_status, to_status')
    .eq('job_id', job.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const event = events?.[0]
  const note = 'Reassigned from ' + oldName + ' to ' + newName
  const pass =
    !error &&
    data?.length === 1 &&
    after &&
    after.status === 'assigned' &&
    after.provider_id === next.id &&
    !eventsError &&
    event?.from_status === 'assigned' &&
    event?.to_status === 'assigned' &&
    event?.note === note
  record(name, pass, pass ? note : error?.message ?? 'the job was not reassigned')
}

function sameJob(before, after) {
  return (
    after &&
    before &&
    after.status === before.status &&
    after.provider_id === before.provider_id &&
    after.proof_photo_path === before.proof_photo_path &&
    after.reopen_count === before.reopen_count &&
    after.reopen_note === before.reopen_note
  )
}

async function landlordJob(landlord, id) {
  const { data, error } = await landlord.client
    .from('jobs')
    .select('id, status, provider_id, description, photo_path, proof_photo_path, reopen_count, reopen_note')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('Could not re-read job ' + id + ': ' + error.message)
    process.exit(1)
  }
  return data
}

function blockedDetail(error) {
  if (error) return 'error: ' + error.message
  return '0 rows'
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
