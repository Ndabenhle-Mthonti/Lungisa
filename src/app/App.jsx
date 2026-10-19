import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Spinner from '../components/Spinner.jsx'
import LoginPage from '../features/auth/LoginPage.jsx'
import RoleGuard from './RoleGuard.jsx'

const LandlordPage = lazy(() => import('../features/landlord/LandlordPage.jsx'))
const PeoplePage = lazy(() => import('../features/landlord/PeoplePage.jsx'))
const TenantPage = lazy(() => import('../features/tenant/TenantPage.jsx'))
const ReportPage = lazy(() => import('../features/tenant/ReportPage.jsx'))
const RequestPage = lazy(() => import('../features/tenant/RequestPage.jsx'))
const ProviderPage = lazy(() => import('../features/provider/ProviderPage.jsx'))
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage.jsx'))
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage.jsx'))
// Temporary preview. Delete this route and DevComponentsPage.jsx later.
const DevComponentsPage = lazy(() => import('./DevComponentsPage.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<main><Spinner /></main>}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/landlord"
            element={
              <RoleGuard role="landlord">
                <LandlordPage />
              </RoleGuard>
            }
          />
          <Route
            path="/landlord/people"
            element={
              <RoleGuard role="landlord">
                <PeoplePage />
              </RoleGuard>
            }
          />
          <Route
            path="/tenant"
            element={
              <RoleGuard role="tenant">
                <TenantPage />
              </RoleGuard>
            }
          />
          <Route
            path="/tenant/report"
            element={
              <RoleGuard role="tenant">
                <ReportPage />
              </RoleGuard>
            }
          />
          <Route
            path="/tenant/requests/:jobId"
            element={
              <RoleGuard role="tenant">
                <RequestPage />
              </RoleGuard>
            }
          />
          <Route
            path="/provider"
            element={
              <RoleGuard role="provider">
                <ProviderPage />
              </RoleGuard>
            }
          />
          <Route path="/dev/components" element={<DevComponentsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
