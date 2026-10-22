import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import { acceptPrivacy } from './api.js'
import './PrivacyNotice.css'

const BUTTON_SIZE = {
  landlord: 'md',
  tenant: 'lg',
  provider: 'xl',
}

export default function PrivacyNotice({ role, acceptedAt }) {
  const queryClient = useQueryClient()
  const [reading, setReading] = useState(false)
  const accepted = Boolean(acceptedAt)
  const open = !accepted || reading
  const size = BUTTON_SIZE[role] || 'md'
  const accept = useMutation({
    mutationFn: acceptPrivacy,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      setReading(false)
    },
  })

  return (
    <>
      <footer className={'app-footer app-footer-' + (role || 'landlord')}>
        <button type="button" className="app-footer-privacy" onClick={() => setReading(true)}>
          Privacy
        </button>
      </footer>
      <Modal
        open={open}
        title="Privacy"
        canClose={accepted}
        closeSize={size}
        onClose={() => setReading(false)}
      >
        <div className="privacy-copy">
          <p>We store your name, phone number, unit, job details, and photos.</p>
          <p>We keep them so maintenance problems can be fixed.</p>
          <p>Your landlord can see them. The provider assigned to your job can see that job.</p>
          <p>
            For a question, or to ask for your information to be deleted, email{' '}
            <a href="mailto:ndabenhleq361@gmail.com">ndabenhleq361@gmail.com</a>.
          </p>
        </div>
        {accepted ? null : (
          <>
            {accept.isError ? (
              <p className="privacy-error" role="alert">
                {accept.error.message}
              </p>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size={size}
              loading={accept.isPending}
              onClick={() => accept.mutate()}
            >
              {accept.isError ? 'Retry' : 'I understand'}
            </Button>
          </>
        )}
      </Modal>
    </>
  )
}
