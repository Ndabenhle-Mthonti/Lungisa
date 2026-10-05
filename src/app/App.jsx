import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from '../features/auth/LoginPage.jsx'

const LandlordPage = lazy(() => import('../features/landlord/LandlordPage.jsx'))
const TenantPage = lazy(() => import('../features/tenant/TenantPage.jsx'))
const ProviderPage = lazy(() => import('../features/provider/ProviderPage.jsx'))
// Temporary preview. Delete this route and DevComponentsPage.jsx later.
const DevComponentsPage = lazy(() => import('./DevComponentsPage.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p>Loading...</p>}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/landlord" element={<LandlordPage />} />
          <Route path="/tenant" element={<TenantPage />} />
          <Route path="/provider" element={<ProviderPage />} />
          <Route path="/dev/components" element={<DevComponentsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
