import LogOutButton from '../features/auth/LogOutButton.jsx'
import './RoleHeader.css'

export default function RoleHeader({ title }) {
  return (
    <header className="role-header">
      <h1>{title}</h1>
      <LogOutButton />
    </header>
  )
}
