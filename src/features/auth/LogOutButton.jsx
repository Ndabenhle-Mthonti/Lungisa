import { useState } from 'react'
import Button from '../../components/Button.jsx'
import { useAuth } from './AuthProvider.jsx'

// Drop this into a role header. It clears the session on this device only.
export default function LogOutButton() {
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await signOut()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="secondary" size="md" loading={loading} onClick={handleClick}>
      Log out
    </Button>
  )
}
