import './Spinner.css'

/*
  A spinning circle with a text alternative.

  decorative
    True inside a button that already has a label. The circle is hidden
    from assistive tech so it is not announced as a second "Loading".
    The button sets aria-busy instead.

  label
    Used when the spinner is the only loading message on the page.
    The words are visually hidden; the circle is what people see.
*/

export default function Spinner({ decorative = false, label = 'Loading' }) {
  if (decorative) {
    return (
      <span className="spinner" aria-hidden="true">
        <span className="spinner-circle" />
      </span>
    )
  }

  return (
    <span className="spinner" role="status">
      <span className="spinner-circle" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
