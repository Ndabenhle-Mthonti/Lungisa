const CATEGORY_LABELS = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  lock: 'Lock',
  appliance: 'Appliance',
  other: 'Other',
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? 'Other'
}

// The person the landlord assigns for each kind of problem.
const WORKER_BY_CATEGORY = {
  plumbing: 'plumber',
  electrical: 'electrician',
  lock: 'locksmith',
  appliance: 'appliance repair',
  other: 'provider',
}

// Matches the trade stored on a provider profile.
const TRADE_BY_CATEGORY = {
  plumbing: 'plumber',
  electrical: 'electrician',
  lock: 'locksmith',
  appliance: 'appliance repair',
  other: 'general',
}

export function workerName(category) {
  return WORKER_BY_CATEGORY[category] ?? 'provider'
}

export function tradeForCategory(category) {
  return TRADE_BY_CATEGORY[category] ?? 'general'
}

export function workerTitle(category) {
  const name = workerName(category)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function assignActionLabel(category) {
  return 'Assign to ' + workerName(category)
}

export function changeWorkerLabel(category) {
  return 'Change ' + workerName(category)
}

export function onTheWayLabel(category) {
  return workerTitle(category) + ' on the way'
}

// Tenant words for a job status. Every tenant screen uses this function.
// Colours stay on StatusBadge: pending is red, assigned and on_the_way are yellow, done is green.
export function tenantJobStatus(status, category) {
  if (status === 'pending') return 'Pending'
  if (status === 'assigned') return 'In Progress'
  if (status === 'on_the_way') return onTheWayLabel(category)
  if (status === 'done') return 'Done'
  return 'Status missing'
}

// "Oct 4". The year is left off so the line stays short on a phone.
export function formatReportedDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
