import LogOutButton from '../features/auth/LogOutButton.jsx'
import './RoleHeader.css'

export default function RoleHeader({ title, logoutSize = 'lg' }) {
  return (
    <header className="role-header">
      <h1>{title}</h1>
      <LogOutButton size={logoutSize} />
    </header>
  )
}
