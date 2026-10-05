import { useState } from 'react'
import './PhotoViewer.css'
import Modal from './Modal.jsx'

/*
  A small photo that opens the full picture.

  The thumbnail is a button, so it works with a tap, Enter, and Space.
  The image alt text becomes that button's accessible name. We do not
  add a second label, or a screen reader would hear the description twice.

  The lightbox is the shared Modal, so it gets the same Escape key,
  close button, and focus behaviour. The full-size image repeats the
  alt text for anyone who lands on the picture itself.

  `src` will later be a short-lived signed URL from private storage.
  This component only displays it. It does not upload or compress.
*/

export default function PhotoViewer({ src, alt }) {
  const [open, setOpen] = useState(false)

  function openPhoto() {
    setOpen(true)
  }

  function closePhoto() {
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="photo-viewer-thumb" onClick={openPhoto}>
        <img src={src} alt={alt} />
      </button>
      <Modal open={open} title="Photo" onClose={closePhoto}>
        <img className="photo-viewer-full" src={src} alt={alt} />
      </Modal>
    </>
  )
}
