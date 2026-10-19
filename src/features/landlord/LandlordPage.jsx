import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import RoleHeader from '../../components/RoleHeader.jsx'

export default function LandlordPage() {
  const navigate = useNavigate()

  return (
    <>
      <RoleHeader title="Landlord" />
      <main>
        <Button variant="secondary" size="md" onClick={() => navigate('/landlord/people')}>
          People
        </Button>
      </main>
    </>
  )
}
