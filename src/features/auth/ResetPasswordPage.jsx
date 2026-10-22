import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ROLE_HOME } from '../../app/RoleGuard.jsx'
import Button from '../../components/Button.jsx'
import Spinner from '../../components/Spinner.jsx'
import { updatePassword, verifyEmailLink } from './api.js'
import { useAuth } from './AuthProvider.jsx'
import { useProfile } from './useProfile.js'
import './LoginPage.css'

const resetSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string().min(8, 'Use at least 8 characters'),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

// Read the email link once, before Supabase removes the tokens from the address bar.
function readResetLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const hasError = Boolean(
    hash.get('error') || hash.get('error_code') || search.get('error') || search.get('error_code'),
  )
  const linkType = hash.get('type') || search.get('type')
  const fromEmail = linkType === 'recovery' || linkType === 'invite'
  const tokenHash = search.get('token_hash') || ''
  return { hasError, fromEmail, linkType, tokenHash }
}

function InvalidResetLink() {
  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      <div className="login-form">
        <p className="login-error" role="alert">This reset link is invalid or has expired.</p>
        <Link className="button button-primary button-lg" to="/forgot-password">Request a new link</Link>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, loading, passwordRecovery, signOut } = useAuth()
  const profile = useProfile()
  const [arrival] = useState(readResetLink)
  const [tokenReady, setTokenReady] = useState(!arrival.tokenHash)
  const [checkingLink, setCheckingLink] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const linkReady = passwordRecovery || (arrival.fromEmail && (Boolean(session) || tokenReady))

  async function continueFromEmail() {
    setFormError('')
    setCheckingLink(true)
    try {
      await verifyEmailLink(arrival.tokenHash, arrival.linkType)
      window.history.replaceState(null, '', '/reset-password')
      setTokenReady(true)
    } catch {
      setFormError('This link is invalid or has expired.')
    } finally {
      setCheckingLink(false)
    }
  }

  async function onSubmit(values) {
    setFormError('')
    try {
      await updatePassword(values.password)
      if (arrival.linkType === 'invite') {
        setPasswordSaved(true)
        return
      }
      await signOut()
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (error) {
      if (error?.code === 'same_password') {
        setFormError('Choose a password you have not used before.')
        return
      }
      setFormError('Could not update your password. Please try again.')
    }
  }

  if (arrival.hasError) return <InvalidResetLink />

  if (arrival.tokenHash && !tokenReady) {
    return (
      <main className="login-page">
        <h1>Lungisa</h1>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault()
            continueFromEmail()
          }}
        >
          <p className="login-note">Continue to choose your password.</p>
          {formError ? <p className="login-error" role="alert">{formError}</p> : null}
          <Button type="submit" variant="primary" size="lg" loading={checkingLink}>
            {formError ? 'Retry' : 'Continue'}
          </Button>
        </form>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="login-page">
        <Spinner />
      </main>
    )
  }

  if (!linkReady) return <InvalidResetLink />

  if (passwordSaved) {
    if (profile.isLoading) {
      return (
        <main className="login-page">
          <Spinner />
        </main>
      )
    }
    const home = ROLE_HOME[profile.data?.role]
    return <Navigate to={home || '/login'} replace />
  }

  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="login-field">
          New password
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password ? <span className="login-error">{errors.password.message}</span> : null}
        </label>
        <label className="login-field">
          Confirm password
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('confirm')}
          />
          {errors.confirm ? <span className="login-error">{errors.confirm.message}</span> : null}
        </label>
        <label className="login-show-password">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          Show password
        </label>
        {formError ? <p className="login-error" role="alert">{formError}</p> : null}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
          {formError ? 'Retry' : 'Save new password'}
        </Button>
      </form>
    </main>
  )
}
