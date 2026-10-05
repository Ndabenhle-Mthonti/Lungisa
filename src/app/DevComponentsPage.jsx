import { useState } from 'react'
import './DevComponentsPage.css'
import Button from '../components/Button.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Modal from '../components/Modal.jsx'
import PhotoViewer from '../components/PhotoViewer.jsx'
import Spinner from '../components/Spinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

/*
  TEMPORARY preview. Delete this file and the /dev/components route
  in App.jsx once the real landlord, tenant and provider screens exist.
  It is not a product screen. It only lets us look at each component.
*/

// A stand-in picture so the preview works with no storage bucket yet.
const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#F9AB00"/>
  <text x="48" y="250" fill="#202124" font-size="42" font-family="sans-serif">Kitchen leak</text>
</svg>`
const samplePhoto = `data:image/svg+xml,${encodeURIComponent(sampleSvg)}`

const buttonRows = [
  { size: 'md', label: 'Medium' },
  { size: 'lg', label: 'Large' },
  { size: 'xl', label: 'Extra large' },
]

export default function DevComponentsPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <main className="dev-page">
      <h1>Component preview</h1>
      <p className="dev-note">
        Temporary page. Delete the /dev/components route before this app is shared.
      </p>

      <section>
        <h2>Buttons</h2>
        {buttonRows.map((row) => (
          <div key={row.size} className="dev-stack">
            <Button variant="primary" size={row.size}>
              {row.label} primary
            </Button>
            <Button variant="secondary" size={row.size}>
              {row.label} secondary
            </Button>
            <Button variant="danger" size={row.size}>
              {row.label} danger
            </Button>
          </div>
        ))}
        <div className="dev-stack">
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section>
        <h2>Status badges</h2>
        <div className="dev-row">
          <StatusBadge status="pending" />
          <StatusBadge status="assigned" />
          <StatusBadge status="on_the_way" />
          <StatusBadge status="done" />
        </div>
      </section>

      <section>
        <h2>Modal</h2>
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Modal
          open={modalOpen}
          title="Assign provider"
          onClose={() => setModalOpen(false)}
        >
          <p>This is a placeholder. Close it with the button or the Escape key.</p>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Example action
          </Button>
        </Modal>
      </section>

      <section>
        <h2>Photo</h2>
        <PhotoViewer src={samplePhoto} alt="Water leaking under the kitchen sink" />
      </section>

      <section>
        <h2>Spinner</h2>
        <Spinner />
      </section>

      <section>
        <h2>Empty state</h2>
        <EmptyState
          title="No jobs yet"
          message="When a tenant reports a problem, it will show up here."
        />
      </section>
    </main>
  )
}
