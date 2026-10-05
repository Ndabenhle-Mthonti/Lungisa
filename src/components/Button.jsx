import './Button.css'
import Spinner from './Spinner.jsx'

/*
  One button for the whole app.

  variant
    primary   — the main action on a screen (Send, Assign)
    secondary — a quieter action (Cancel, View)
    danger    — a destructive action, painted with the pending red

  size
    md — 40px. Fine for a landlord sitting at a desk.
    lg — 56px. Tenant buttons. A thumb must hit them easily.
    xl — 64px and full width. Provider buttons, used outdoors on a phone.

  loading
    Shows a spinner and disables the button. A slow photo upload must
    not send the form twice if the person taps again.

  type defaults to "button". Inside a form, a button with no type
  submits the form. Callers pass type="submit" only on the real submit.
*/

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  children,
  ...rest
}) {
  // Loading and disabled both block the click. The spinner is decorative
  // here because the button label is still visible, and aria-busy tells
  // assistive tech that this control is working.
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      {...rest}
      className={`button button-${variant} button-${size}`}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : 'false'}
    >
      {loading ? <Spinner decorative /> : null}
      {children}
    </button>
  )
}
