import { useState } from 'react'
import './PhotoViewer.css'
import Button from './Button.jsx'
import Modal from './Modal.jsx'

/*
  A small photo that opens the full picture.

  The thumbnail is a button, so it works with a tap, Enter, and Space.
  The image alt text becomes that button's accessible name. We do not
  add a second label, or a screen reader would hear the description twice.

  The lightbox is the shared Modal, so it gets the same Escape key,
  close button, and focus behaviour. The full-size image repeats the
  alt text for anyone who lands on the picture itself.

  `src` is the full photo. Pass `thumbSrc` when the list should show a smaller picture.
  This component only displays them. It does not upload or compress.
*/

export default function PhotoViewer({ src, thumbSrc, alt, onOpen, onThumbError, label }) {
  const [open, setOpen] = useState(false)
  const thumb = thumbSrc || src

  function openPhoto() {
    if (!src && label) return
    if (onOpen) onOpen()
    setOpen(true)
  }

  function closePhoto() {
    setOpen(false)
  }

  return (
    <>
      {label ? (
        <Button variant="secondary" size="xl" onClick={openPhoto} disabled={!src}>
          {label}
        </Button>
      ) : (
        <button type="button" className="photo-viewer-thumb" onClick={openPhoto}>
          <img src={thumb} alt={alt} loading="lazy" onError={onThumbError} />
        </button>
      )}
      <Modal open={open} title="Photo" onClose={closePhoto}>
        <img className="photo-viewer-full" src={src} alt={alt} />
      </Modal>
    </>
  )
}
