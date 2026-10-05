import './EmptyState.css'

/*
  What a list shows when there is nothing in it.
  Example: a provider with no jobs today.

  title is the short line. message is the plain-language next step.
  Both are real text, not colour or an icon alone, so the screen
  still makes sense if images fail to load.
*/

export default function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {message ? <p className="empty-state-message">{message}</p> : null}
    </div>
  )
}
