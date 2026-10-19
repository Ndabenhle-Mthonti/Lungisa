import './StatusBadge.css'

/*
  The only job statuses, in lifecycle order:
  pending -> assigned -> on_the_way -> done

  Assigned and on_the_way share the yellow. A screen can pass its own
  label, such as the tenant words from tenantJobStatus.

  The class names live in this map on purpose. Building a class from
  the raw status string would let an unexpected value inject a class.
*/

const STATUSES = {
  pending: { label: 'Pending', className: 'status-badge-pending' },
  assigned: { label: 'Assigned', className: 'status-badge-assigned' },
  on_the_way: { label: 'On the way', className: 'status-badge-on-the-way' },
  done: { label: 'Done', className: 'status-badge-done' },
}

export default function StatusBadge({ status, label }) {
  const known = STATUSES[status]
  const text = label || known?.label || status

  // An unknown value still prints the word. A blank badge would hide
  // the problem. The neutral style makes the mistake obvious in the UI.
  if (!known) {
    return <span className="status-badge status-badge-unknown">{text}</span>
  }

  return <span className={`status-badge ${known.className}`}>{text}</span>
}
