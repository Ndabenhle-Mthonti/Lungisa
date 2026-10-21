import { Link, NavLink } from 'react-router-dom'
import LogOutButton from '../auth/LogOutButton.jsx'
import './LandlordShell.css'

export default function LandlordShell({ children }) {
  return (
    <div className="landlord-shell">
      <header className="landlord-header">
        <Link to="/landlord" className="landlord-brand">
          Lungisa
        </Link>
        <nav className="landlord-nav" aria-label="Landlord">
          <NavLink to="/landlord" end className="landlord-nav-link">
            Dashboard
          </NavLink>
          <NavLink to="/landlord/people" className="landlord-nav-link">
            People
          </NavLink>
        </nav>
        <LogOutButton />
      </header>
      <main>{children}</main>
    </div>
  )
}
