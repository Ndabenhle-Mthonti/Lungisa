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

// Tenant words for a job status. Every tenant screen uses this function.
// Colours stay on StatusBadge: pending is red, assigned and on_the_way are yellow, done is green.
export function tenantJobStatus(status) {
  if (status === 'pending') return 'Pending'
  if (status === 'assigned') return 'In Progress'
  if (status === 'on_the_way') return 'Provider is on the way'
  if (status === 'done') return 'Done'
  return 'Status missing'
}

// "Oct 4". The year is left off so the line stays short on a phone.
export function formatReportedDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
