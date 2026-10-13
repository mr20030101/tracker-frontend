import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { SpotlightDialog } from './SpotlightDialog'

// The contributor's "nothing submitted yet this week" nudge: a rocket in a spinning ring, a line
// of encouragement, and a shortcut to submit.

const ENCOURAGEMENTS = [
  'Every great week starts with one task. Let’s log your first!',
  'You’ve got this. One submission gets the ball rolling.',
  'Small steps add up. Your first task this week is waiting!',
  'The leaderboard is saving you a spot. Go claim it!',
  'Fresh week, fresh start. Show them what you can do!',
]

export function NoSubmissionNudge({ onSubmit, onDismiss }: { onSubmit: () => void; onDismiss: () => void }) {
  const [message] = useState(() => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)])

  return (
    <SpotlightDialog icon={Rocket} title="You have no submissions yet." primary={{ label: '+ Submit a Task', onClick: onSubmit }} onClose={onDismiss}>
      {message}
    </SpotlightDialog>
  )
}
