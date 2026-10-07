import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AccountNotSetUp, ROLE_HOME } from '../../app/RoleGuard.jsx'
import Button from '../../components/Button.jsx'
import Spinner from '../../components/Spinner.jsx'
import LogOutButton from './LogOutButton.jsx'
import { useAuth } from './AuthProvider.jsx'
import { useProfile } from './useProfile.js'
import './LoginPage.css'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
})

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const profile = useProfile()
  const location = useLocation()
  const navigate = useNavigate()
  const passwordChanged = Boolean(location.state?.passwordChanged)
  // Keep the success sentence after the address state is cleared, so the next sign-in can leave this page.
  const [showResetNotice, setShowResetNotice] = useState(passwordChanged)
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (!passwordChanged || loading || session) return
    setShowResetNotice(true)
    navigate('/login', { replace: true, state: null })
  }, [passwordChanged, loading, session, navigate])

  async function onSubmit(values) {
    setFormError('')
    try {
      await signIn(values.email, values.password)
    } catch (error) {
      // One message for a bad email or a bad password, so we do not reveal which one was wrong.
      if (error?.code === 'invalid_credentials') {
        setFormError('Wrong email or password')
        return
      }
      setFormError('Something went wrong. Please try again.')
    }
  }

  if (loading) {
    return (
      <main className="login-page">
        <Spinner />
      </main>
    )
  }

  if (session && passwordChanged) {
    return (
      <main className="login-page">
        <Spinner />
      </main>
    )
  }

  if (session) {
    if (profile.isLoading) {
      return (
        <main className="login-page">
          <Spinner />
        </main>
      )
    }

    if (profile.isError) {
      return (
        <main className="login-page">
          <p className="login-error">Could not load your profile. Please try again.</p>
          <LogOutButton />
        </main>
      )
    }

    const home = ROLE_HOME[profile.data?.role]
    if (!home) return <AccountNotSetUp />
    return <Navigate to={home} replace />
  }

  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      {showResetNotice ? (
        <p className="login-success" role="status">Your password has been changed. Sign in with the new one.</p>
      ) : null}
      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="login-field">
          Email
          <input type="email" autoComplete="email" {...register('email')} />
          {errors.email ? <span className="login-error">{errors.email.message}</span> : null}
        </label>
        <label className="login-field">
          Password
          <input type="password" autoComplete="current-password" {...register('password')} />
          {errors.password ? <span className="login-error">{errors.password.message}</span> : null}
        </label>
        {formError ? <p className="login-error" role="alert">{formError}</p> : null}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
        <Link className="login-link" to="/forgot-password">Forgot password?</Link>
      </form>
    </main>
  )
}
