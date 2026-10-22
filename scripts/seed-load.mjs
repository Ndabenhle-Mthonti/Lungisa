import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Development load test only. Inserts 100,000 jobs through the service role key.
// Every description starts with LOAD-TEST so scripts/clearload.mjs can remove them.
// The key is read from the environment. This file is not imported by the React app.
//
//   $env:ALLOW_LOAD_SEED = 'yes'
//   node --env-file=.env.local scripts/seed-load.mjs

const TOTAL = 100000
const BATCH = 1000
const MARK = 'LOAD-TEST'
const PHOTO = 'seed/placeholder.jpg'
const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 540

const CATEGORIES = ['plumbing', 'electrical', 'lock', 'appliance', 'other']
const STATUSES = ['pending', 'assigned', 'on_the_way', 'done']
const TRADE_FOR = {
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

const { url, serviceKey } = readEnv()
const admin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

function readEnv() {
  const projectUrl = process.env.VITE_SUPABASE_URL
  const key = process.env.SEED_SERVICE_ROLE_KEY
  const missing = []
  if (!projectUrl) missing.push('VITE_SUPABASE_URL')
  if (!key) missing.push('SEED_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    console.error('Missing ' + missing.join(', ') + ' in the environment.')
    console.error('Put them in .env.local, then run this script with node --env-file=.env.local.')
    process.exit(1)
  }
  return { url: projectUrl, serviceKey: key }
}

function refuseUnlessAllowed() {
  if (process.env.ALLOW_LOAD_SEED !== 'yes') {
    console.error('Refusing to run. This script writes ' + TOTAL + ' jobs.')
    console.error('Set ALLOW_LOAD_SEED=yes only when VITE_SUPABASE_URL is your development project.')
    process.exit(1)
  }
}

// The linked CLI project is the development database. Refuse a different URL.
function refuseUnlessDevelopment(projectUrl) {
  const refPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', '.temp', 'project-ref')
  if (!existsSync(refPath)) return
  const ref = readFileSync(refPath, 'utf8').trim()
  if (!ref || projectUrl.includes(ref)) return
  console.error('Refusing to run. This URL is not the linked development project (' + ref + ').')
  process.exit(1)
}

function fail(step, error) {
  console.error(step + ' failed: ' + (error?.message ?? error))
  // Exiting at once, while a connection is still closing, crashes Node on Windows.
  setTimeout(() => process.exit(1), 300)
  return new Promise(() => {})
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The batch was not saved. Supabase sometimes drops the connection or loses its schema cache under a long insert.
function isTransient(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('schema cache') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('pool') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('upstream') ||
    message.includes('disconnect') ||
    message.includes('connection') ||
    message.includes('reset') ||
    message.includes('terminated') ||
    message.includes('socket') ||
    message.includes('too many requests') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  )
}

async function readQuery(step, run) {
  const attempts = 8
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data, error, count } = await run()
    if (!error) return { data: data ?? [], count }
    if (isTransient(error) && attempt < attempts) {
      const waitSeconds = attempt * 5
      console.log('Database connection pool is busy. Retrying in ' + waitSeconds + 's.')
      await sleep(waitSeconds * 1000)
      continue
    }
    return fail(step, error)
  }
  return { data: [], count: 0 }
}

async function fetchAll(buildQuery) {
  const rows = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data } = await readQuery('Read rows', () => buildQuery().range(from, from + pageSize - 1))
    rows.push(...data)
    if (data.length < pageSize) return rows
    from += pageSize
  }
}

function chooseLandlord(tenants, providers) {
  const counts = new Map()
  for (const tenant of tenants) {
    if (!tenant.unit_id || !tenant.landlord_id) continue
    counts.set(tenant.landlord_id, (counts.get(tenant.landlord_id) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1])
  for (const [landlordId] of ranked) {
    const landlordTenants = tenants.filter(
      (tenant) => tenant.landlord_id === landlordId && tenant.unit_id,
    )
    const landlordProviders = providers.filter((provider) => provider.landlord_id === landlordId)
    if (landlordTenants.length > 0 && landlordProviders.length > 0) {
      return { landlordId, tenants: landlordTenants, providers: landlordProviders }
    }
  }
  return null
}

function providersByTrade(providers) {
  const grouped = new Map()
  for (const provider of providers) {
    const trade = provider.trade || ''
    const list = grouped.get(trade) ?? []
    list.push(provider)
    grouped.set(trade, list)
  }
  return grouped
}

function pickProvider(category, index, grouped, providers) {
  const preferred = grouped.get(TRADE_FOR[category])
  const pool = preferred && preferred.length > 0 ? preferred : providers
  return pool[index % pool.length].id
}

function createdAt(index) {
  // Leave four days so a finished job can be assigned, started, and completed before now.
  const newestDaysAgo = 4
  const daysAgo = newestDaysAgo + Math.floor((index / TOTAL) * (HISTORY_DAYS - newestDaysAgo))
  const hours = (index * 7) % 24
  const minutes = (index * 13) % 60
  return new Date(Date.now() - daysAgo * DAY_MS - hours * 60 * 60 * 1000 - minutes * 60 * 1000).toISOString()
}

function shift(iso, hours) {
  const start = new Date(iso).getTime()
  const next = start + hours * 60 * 60 * 1000
  const latest = Date.now() - 60 * 1000
  return new Date(Math.max(start, Math.min(next, latest))).toISOString()
}

function buildJob(index, tenants, grouped, providers) {
  const tenant = tenants[index % tenants.length]
  const category = CATEGORIES[index % CATEGORIES.length]
  const status = STATUSES[index % STATUSES.length]
  const samples = ISSUES[category]
  const created = createdAt(index)
  const pending = status === 'pending'
  const started = status === 'on_the_way' || status === 'done'
  const finished = status === 'done'

  return {
    landlord_id: tenant.landlord_id,
    unit_id: tenant.unit_id,
    tenant_id: tenant.id,
    provider_id: pending ? null : pickProvider(category, index, grouped, providers),
    category,
    description: MARK + ' ' + samples[index % samples.length],
    photo_path: PHOTO,
    proof_photo_path: finished ? PHOTO : null,
    status,
    is_urgent: !finished && status !== 'on_the_way' && index % 17 === 0,
    created_at: created,
    assigned_at: pending ? null : shift(created, 20),
    on_the_way_at: started ? shift(created, 30) : null,
    completed_at: finished ? shift(created, 72) : null,
  }
}

async function insertBatch(rows, start) {
  const attempts = 8
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data, error } = await admin.rpc('insert_load_test_jobs', { payload: rows })
    if (!error && Number(data) === rows.length) {
      await sleep(500)
      return
    }

    if (error && isTransient(error) && attempt < attempts) {
      const waitSeconds = attempt * 3
      console.log('Connection dropped. Retrying in ' + waitSeconds + 's.')
      await sleep(waitSeconds * 1000)
      continue
    }

    if (error) {
      console.error('Insert failed after ' + start + ' jobs: ' + error.message)
      console.error('Apply supabase/migrations/0015_load_test_jobs.sql if the function is missing.')
      console.error('Run this script again to continue, or scripts/clearload.mjs to remove the LOAD-TEST jobs.')
      process.exit(1)
    }

    console.error('Batch inserted ' + data + ' rows, expected ' + rows.length + '.')
    console.error('Run scripts/clearload.mjs before loading another set.')
    process.exit(1)
  }
}

async function main() {
  refuseUnlessAllowed()
  console.log('Project URL: ' + url)
  refuseUnlessDevelopment(url)
  console.log('Inserting ' + TOTAL + ' LOAD-TEST jobs in batches of ' + BATCH + '.')

  const tenants = await fetchAll(() =>
    admin.from('profiles').select('id, unit_id, landlord_id').eq('role', 'tenant'),
  )
  const providers = await fetchAll(() =>
    admin.from('profiles').select('id, landlord_id, trade').eq('role', 'provider'),
  )
  const chosen = chooseLandlord(tenants, providers)
  if (!chosen) {
    console.error('No landlord with both a tenant and a provider was found. Run scripts/seed.mjs first.')
    process.exit(1)
  }

  const { count } = await readQuery('Count existing load-test jobs', () =>
    admin.from('jobs').select('id', { count: 'exact', head: true }).like('description', MARK + '%'),
  )
  const existing = count ?? 0
  if (existing > TOTAL) {
    console.error(existing + ' LOAD-TEST jobs are already in this project, which is more than ' + TOTAL + '.')
    console.error('Run scripts/clearload.mjs before loading another set.')
    process.exit(1)
  }
  if (existing === TOTAL) {
    console.log(TOTAL + ' LOAD-TEST jobs are already loaded.')
    return
  }
  if (existing > 0 && existing % BATCH !== 0) {
    console.error(existing + ' LOAD-TEST jobs are loaded, which is not a full batch of ' + BATCH + '.')
    console.error('Run scripts/clearload.mjs before loading another set.')
    process.exit(1)
  }
  if (existing > 0) {
    console.log(existing + ' LOAD-TEST jobs are already loaded. Continuing from there.')
  }

  const unitCount = new Set(chosen.tenants.map((tenant) => tenant.unit_id)).size
  console.log(
    'Landlord ' +
      chosen.landlordId +
      ': ' +
      unitCount +
      ' units, ' +
      chosen.tenants.length +
      ' tenants, ' +
      chosen.providers.length +
      ' providers.',
  )

  const grouped = providersByTrade(chosen.providers)
  for (let start = existing; start < TOTAL; start += BATCH) {
    const end = Math.min(start + BATCH, TOTAL)
    const rows = []
    for (let index = start; index < end; index += 1) {
      rows.push(buildJob(index, chosen.tenants, grouped, chosen.providers))
    }
    await insertBatch(rows, start)
    console.log('Inserted ' + end + ' / ' + TOTAL)
  }

  console.log('Load test finished. ' + TOTAL + ' jobs now start with ' + MARK + '.')
  console.log('Statuses cycle through pending, assigned, on the way, and done.')
  console.log('Created dates run from now back about ' + HISTORY_DAYS + ' days.')
  console.log('Remove them with scripts/clearload.mjs.')
}

main()
