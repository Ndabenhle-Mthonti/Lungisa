import { useEffect, useId, useRef } from 'react'
import './Modal.css'
import Button from './Button.jsx'

/*
  A small accessible dialog.

  We use the native <dialog> element and open it with showModal()
  instead of building a focus trap by hand:
  - the browser moves focus into the dialog
  - Tab stays inside it
  - the rest of the page becomes inert (clicks do nothing)
  - when the dialog closes, focus returns to the button that opened it

  React still owns the `open` prop. Escape fires the browser's "cancel"
  event. We stop the browser from closing the dialog on its own, then
  tell the parent. The parent sets open to false, and the effect below
  calls close(). One source of truth, so the dialog cannot be open in
  the DOM while React thinks it is closed.
*/

export default function Modal({ open, title, onClose, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      // showModal() throws if you call it on a dialog that is already open.
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleCancel(event) {
    // Escape. preventDefault keeps the dialog open until React closes it.
    event.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={handleCancel}
    >
      <div className="modal-header">
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <Button variant="secondary" size="md" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
