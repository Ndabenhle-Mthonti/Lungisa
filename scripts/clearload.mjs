import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Deletes only the jobs created by scripts/seed-load.mjs.
// A row counts as load-test data when its description starts with LOAD-TEST.
// The service role key is read from the environment. This file is not imported by the React app.
//
//   $env:ALLOW_LOAD_SEED = 'yes'
//   node --env-file=.env.local scripts/clearload.mjs

const MARK = 'LOAD-TEST'
const BATCH = 1000

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
    console.error('Refusing to run. This script deletes every job whose description starts with ' + MARK + '.')
    console.error('Set ALLOW_LOAD_SEED=yes only when VITE_SUPABASE_URL is your development project.')
    process.exit(1)
  }
}

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
  process.exit(1)
}

async function main() {
  refuseUnlessAllowed()
  console.log('Project URL: ' + url)
  refuseUnlessDevelopment(url)
  console.log('Removing jobs whose description starts with ' + MARK + '.')

  let removed = 0
  while (true) {
    const { data, error } = await admin.rpc('delete_load_test_jobs', { batch_size: BATCH })
    if (error) {
      console.error('Delete failed after ' + removed + ' jobs: ' + error.message)
      console.error('Apply supabase/migrations/0015_load_test_jobs.sql if the function is missing.')
      process.exit(1)
    }
    const count = Number(data)
    if (!count) break
    removed += count
    console.log('Removed ' + removed)
  }

  if (removed === 0) {
    console.log('No LOAD-TEST jobs to remove.')
    return
  }
  console.log('Removed ' + removed + ' LOAD-TEST jobs. Other jobs were left in place.')
}

main()
