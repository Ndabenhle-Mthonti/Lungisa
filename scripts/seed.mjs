import { createClient } from '@supabase/supabase-js'

// Local seed data only. The service role key is read from the environment.
// It is never written here and this file is not imported by the React app.

const PASSWORD = 'LungisaDev123'
const SEED_EMAIL_DOMAIN = '@seed.lungisa.test'
const PLACEHOLDER_PHOTO = 'seed/placeholder.jpg'

const LANDLORD = {
  fullName: 'Thandi',
  email: 'thandi@seed.lungisa.test',
  phone: '071 123 4567',
}

const TENANTS = [
  { fullName: 'Lerato', email: 'lerato@seed.lungisa.test', phone: '072 234 5678', unit: 'Flat 1A' },
  { fullName: 'Nokuthula', email: 'nokuthula@seed.lungisa.test', phone: '073 345 6789', unit: 'Flat 4B' },
  { fullName: 'Andile', email: 'andile@seed.lungisa.test', phone: '074 456 7890', unit: 'Flat 7C' },
]

const PROVIDERS = [
  { key: 'plumber', fullName: 'Sipho', email: 'sipho@seed.lungisa.test', phone: '081 567 8901', trade: 'plumber' },
  { key: 'electrician', fullName: 'Themba', email: 'themba@seed.lungisa.test', phone: '082 678 9012', trade: 'electrician' },
  { key: 'locksmith', fullName: 'Jabu', email: 'jabu@seed.lungisa.test', phone: '083 789 0123', trade: 'locksmith' },
]

const CATEGORIES = ['plumbing', 'electrical', 'lock', 'appliance', 'other']
const STATUSES = ['pending', 'assigned', 'on_the_way', 'done']
const PROVIDER_FOR_CATEGORY = {
  plumbing: 'plumber',
  electrical: 'electrician',
  lock: 'locksmith',
  appliance: 'plumber',
  other: 'electrician',
}
const ISSUES = {
  plumbing: ['Leak under the kitchen sink', 'Toilet will not flush', 'No hot water'],
  electrical: ['Bedroom plug is dead', 'Passage light flickers', 'Stove trips the power'],
  lock: ['Front door lock is stuck', 'Gate lock will not turn', 'Bathroom door will not lock'],
  appliance: ['Fridge is not cold', 'Washing machine will not spin', 'Oven does not heat'],
  other: ['Damp patch on the ceiling', 'Broken window pane', 'Cupboard door has come off'],
}

const { url, anonKey, serviceKey } = readEnv()
const admin = createClient(url, serviceKey, clientOptions())
const sessions = new Map()

function readEnv() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SEED_SERVICE_ROLE_KEY
  const missing = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!serviceKey) missing.push('SEED_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    console.error('Missing ' + missing.join(', ') + ' in the environment.')
    console.error('Put them in .env.local, then run: node --env-file=.env.local scripts/seed.mjs')
    process.exit(1)
  }
  return { url, anonKey, serviceKey }
}

function clientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
}

async function must(promise, step) {
  const result = await promise
  if (result.error) {
    console.error(step + ' failed: ' + result.error.message)
    process.exit(1)
  }
  return result.data
}

async function listSeedUserIds() {
  const ids = []
  let page = 1
  while (true) {
    const data = await must(admin.auth.admin.listUsers({ page, perPage: 200 }), 'List users')
    const users = data.users ?? []
    for (const user of users) {
      if (user.email && user.email.endsWith(SEED_EMAIL_DOMAIN)) ids.push(user.id)
    }
    if (users.length < 200) break
    page += 1
  }
  return ids
}

// Jobs point at people, and people point at units. Delete from the outside in,
// and only rows owned by the seed email addresses.
async function clearOldSeed() {
  const ids = await listSeedUserIds()
  if (ids.length === 0) {
    console.log('No old seed data to clear.')
    return
  }

  const jobs = await must(admin.from('jobs').select('id').in('landlord_id', ids), 'Find seed jobs')
  const jobIds = (jobs ?? []).map((job) => job.id)

  if (jobIds.length > 0) {
    await must(admin.from('job_events').delete().in('job_id', jobIds), 'Delete seed job history')
    await must(admin.from('jobs').delete().in('id', jobIds), 'Delete seed jobs')
  }
  await must(admin.from('job_events').delete().in('actor_id', ids), 'Delete leftover seed history')
  await must(admin.from('invites').delete().in('landlord_id', ids), 'Delete seed invites')
  await must(
    admin.from('profiles').update({ unit_id: null, landlord_id: null }).in('id', ids),
    'Unlink seed profiles',
  )
  await must(admin.from('units').delete().in('landlord_id', ids), 'Delete seed units')
  await must(admin.from('properties').delete().in('landlord_id', ids), 'Delete seed properties')

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) {
      console.error('Delete seed user failed: ' + error.message)
      process.exit(1)
    }
  }
  console.log('Cleared ' + ids.length + ' old seed accounts.')
}

async function createLogin(person) {
  const created = await must(
    admin.auth.admin.createUser({
      email: person.email,
      password: PASSWORD,
      email_confirm: true,
    }),
    'Create login for ' + person.email,
  )
  return created.user.id
}

async function createAccounts() {
  const landlordId = await createLogin(LANDLORD)
  await must(
    admin.from('profiles').insert({
      id: landlordId,
      role: 'landlord',
      full_name: LANDLORD.fullName,
      phone: LANDLORD.phone,
    }),
    'Create landlord profile',
  )

  const property = await must(
    admin
      .from('properties')
      .insert({
        landlord_id: landlordId,
        name: 'Rose Court',
        address: '10 Example Road, Johannesburg',
      })
      .select('id')
      .single(),
    'Create property',
  )

  const unitRows = TENANTS.map((tenant) => ({
    property_id: property.id,
    landlord_id: landlordId,
    label: tenant.unit,
  }))
  const units = await must(admin.from('units').insert(unitRows).select('id, label'), 'Create units')
  const unitIdByLabel = new Map(units.map((unit) => [unit.label, unit.id]))

  const tenants = []
  for (const tenant of TENANTS) {
    const id = await createLogin(tenant)
    const unitId = unitIdByLabel.get(tenant.unit)
    await must(
      admin.from('profiles').insert({
        id,
        role: 'tenant',
        full_name: tenant.fullName,
        phone: tenant.phone,
        landlord_id: landlordId,
        unit_id: unitId,
      }),
      'Create tenant profile for ' + tenant.fullName,
    )
    tenants.push({ ...tenant, id, unitId })
  }

  const providers = {}
  for (const provider of PROVIDERS) {
    const id = await createLogin(provider)
    await must(
      admin.from('profiles').insert({
        id,
        role: 'provider',
        full_name: provider.fullName,
        phone: provider.phone,
        landlord_id: landlordId,
        trade: provider.trade,
      }),
      'Create provider profile for ' + provider.fullName,
    )
    providers[provider.key] = { ...provider, id }
  }

  return { landlordId, tenants, providers }
}

// The anon key is used here on purpose. Signing in sets auth.uid() to that person,
// which the job history trigger requires. The service role key has no user id.
async function asUser(email) {
  const existing = sessions.get(email)
  if (existing) return existing

  const client = createClient(url, anonKey, clientOptions())
  await must(
    client.auth.signInWithPassword({ email, password: PASSWORD }),
    'Sign in as ' + email,
  )
  sessions.set(email, client)
  return client
}

function buildJobs(tenants) {
  const jobs = []
  for (let index = 0; index < 50; index += 1) {
    const category = CATEGORIES[index % CATEGORIES.length]
    const samples = ISSUES[category]
    jobs.push({
      tenant: tenants[index % tenants.length],
      category,
      status: STATUSES[index % STATUSES.length],
      description: samples[index % samples.length],
      providerKey: PROVIDER_FOR_CATEGORY[category],
      isUrgent: false,
    })
  }

  // "Not fixed" is tested on a finished job, so each tenant needs a few of those.
  for (const tenant of tenants) {
    const theirs = jobs.filter((job) => job.tenant === tenant)
    let doneCount = theirs.filter((job) => job.status === 'done').length
    for (const job of theirs) {
      if (doneCount >= 3) break
      if (job.status !== 'done') {
        job.status = 'done'
        doneCount += 1
      }
    }
  }

  // Urgent is only for jobs still waiting: pending or assigned. About five of those.
  const waiting = jobs.filter((job) => job.status === 'pending' || job.status === 'assigned')
  const urgent = []
  for (const tenant of tenants) {
    const match = waiting.find((job) => job.tenant === tenant && !urgent.includes(job))
    if (match) urgent.push(match)
  }
  for (const job of waiting) {
    if (urgent.length >= 5) break
    if (!urgent.includes(job)) urgent.push(job)
  }
  for (const job of urgent) job.isUrgent = true

  return jobs
}

// A job can only move one step at a time: pending, then assigned, then on the way, then done.
async function createJobs(landlordId, tenants, providers) {
  const jobs = buildJobs(tenants)
  const counts = { pending: 0, assigned: 0, on_the_way: 0, done: 0, urgent: 0 }

  for (const job of jobs) {
    const tenantClient = await asUser(job.tenant.email)
    const inserted = await must(
      tenantClient
        .from('jobs')
        .insert({
          landlord_id: landlordId,
          unit_id: job.tenant.unitId,
          tenant_id: job.tenant.id,
          category: job.category,
          description: job.description,
          photo_path: PLACEHOLDER_PHOTO,
          is_urgent: job.isUrgent,
        })
        .select('id')
        .single(),
      'Create job',
    )

    if (job.isUrgent) counts.urgent += 1

    if (job.status === 'pending') {
      counts.pending += 1
      continue
    }

    const landlordClient = await asUser(LANDLORD.email)
    await must(
      landlordClient
        .from('jobs')
        .update({
          status: 'assigned',
          provider_id: providers[job.providerKey].id,
        })
        .eq('id', inserted.id),
      'Assign job',
    )

    if (job.status === 'assigned') {
      counts.assigned += 1
      continue
    }

    const providerClient = await asUser(providers[job.providerKey].email)
    await must(
      providerClient.from('jobs').update({ status: 'on_the_way' }).eq('id', inserted.id),
      'Mark job on the way',
    )

    if (job.status === 'on_the_way') {
      counts.on_the_way += 1
      continue
    }

    await must(
      providerClient
        .from('jobs')
        .update({
          status: 'done',
          proof_photo_path: PLACEHOLDER_PHOTO,
        })
        .eq('id', inserted.id),
      'Mark job done',
    )
    counts.done += 1
  }

  return counts
}

function printSummary(counts) {
  console.log('')
  console.log('Seed finished.')
  console.log('Dev password for every account: ' + PASSWORD)
  console.log('Landlord: ' + LANDLORD.fullName + '  ' + LANDLORD.email)
  for (const tenant of TENANTS) {
    console.log('Tenant:   ' + tenant.fullName + '  ' + tenant.email + '  ' + tenant.unit)
  }
  for (const provider of PROVIDERS) {
    console.log('Provider: ' + provider.fullName + '  ' + provider.email + '  ' + provider.trade)
  }
  console.log(
    'Jobs: ' +
      (counts.pending + counts.assigned + counts.on_the_way + counts.done) +
      ' (pending ' +
      counts.pending +
      ', assigned ' +
      counts.assigned +
      ', on the way ' +
      counts.on_the_way +
      ', done ' +
      counts.done +
      ', urgent ' +
      counts.urgent +
      ')',
  )
}

async function main() {
  console.log('Dev password for every account: ' + PASSWORD)
  await clearOldSeed()
  const { landlordId, tenants, providers } = await createAccounts()
  const counts = await createJobs(landlordId, tenants, providers)
  printSummary(counts)
}

main()
