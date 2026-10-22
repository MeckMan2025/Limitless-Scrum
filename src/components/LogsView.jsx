import OutreachLog from './OutreachLog'
import ExpenseLog from './ExpenseLog'
import MentorLog from './MentorLog'

// Logs is three pages behind one sidebar section, so this is just the switch
// between them. Anything pointing at plain 'logs' lands on the first rather
// than falling through to a blank screen.
export default function LogsView({ log }) {
  if (log === 'logs-expenses') return <ExpenseLog />
  if (log === 'logs-mentor') return <MentorLog />
  return <OutreachLog />
}
