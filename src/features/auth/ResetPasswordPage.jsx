import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Button from '../../components/Button.jsx'
import Spinner from '../../components/Spinner.jsx'
import { updatePassword } from './api.js'
import { useAuth } from './AuthProvider.jsx'
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
  const fromEmail = hash.get('type') === 'recovery' || search.get('type') === 'recovery'
  return { hasError, fromEmail }
}

function InvalidResetLink() {
  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      <div className="login-form">
        <p className="login-note">This reset link is invalid or has expired.</p>
        <Link className="login-link" to="/forgot-password">Request a new one</Link>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, loading, passwordRecovery, signOut } = useAuth()
  const [arrival] = useState(readResetLink)
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const linkReady = passwordRecovery || (arrival.fromEmail && Boolean(session))

  async function onSubmit(values) {
    setFormError('')
    try {
      await updatePassword(values.password)
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

  if (loading) {
    return (
      <main className="login-page">
        <Spinner />
      </main>
    )
  }

  if (!linkReady) return <InvalidResetLink />

  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="login-field">
          New password
          <input type="password" autoComplete="new-password" {...register('password')} />
          {errors.password ? <span className="login-error">{errors.password.message}</span> : null}
        </label>
        <label className="login-field">
          Confirm password
          <input type="password" autoComplete="new-password" {...register('confirm')} />
          {errors.confirm ? <span className="login-error">{errors.confirm.message}</span> : null}
        </label>
        {formError ? <p className="login-error" role="alert">{formError}</p> : null}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
          Save new password
        </Button>
      </form>
    </main>
  )
}
