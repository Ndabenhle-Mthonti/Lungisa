import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Button from '../../components/Button.jsx'
import { requestPasswordReset } from './api.js'
import './LoginPage.css'

const RESEND_WAIT_SECONDS = 30

const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
})

// These errors mean "no such account". Showing them would reveal who has an account.
function isUnknownAccount(error) {
  return error?.code === 'user_not_found' || error?.code === 'email_not_found'
}

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  })

  useEffect(() => {
    if (cooldown === 0) return undefined
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function onSubmit(values) {
    setFormError('')
    try {
      await requestPasswordReset(values.email)
      setSent(true)
      setCooldown(RESEND_WAIT_SECONDS)
    } catch (error) {
      if (isUnknownAccount(error)) {
        setSent(true)
        setCooldown(RESEND_WAIT_SECONDS)
        return
      }
      setFormError('Something went wrong. Please try again.')
    }
  }

  return (
    <main className="login-page">
      <h1>Lungisa</h1>
      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="login-field">
          Email
          <input type="email" autoComplete="email" {...register('email')} />
          {errors.email ? <span className="login-error">{errors.email.message}</span> : null}
        </label>
        {sent ? (
          <p className="login-note" role="status">
            If this email has an account, we sent a reset link.
          </p>
        ) : null}
        {formError ? <p className="login-error" role="alert">{formError}</p> : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={cooldown > 0}
        >
          {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send reset link'}
        </Button>
        <Link className="login-link" to="/login">Back to sign in</Link>
      </form>
    </main>
  )
}
