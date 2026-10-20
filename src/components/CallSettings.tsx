import { useState } from 'react'
import { Check, Mic, Smartphone, Volume2 } from 'lucide-react'
import { useCall } from '../lib/call'
import { canChooseOutput, routeCallAudio, useMediaDevices, type SpeakerMode } from '../lib/callDevices'
import { MESSAGE_NOTIFICATION_SOUND } from '../lib/sound'
import { Select } from './Select'

// Above the call card (z-70), so the device lists open over it.
const LIST_Z_INDEX = 80
const METER_SEGMENTS = 12
const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'

// The call card's settings: which mic and speaker to use on a desktop, or loudspeaker / phone on a
// phone. Changes apply to the call in progress and are remembered for the next one.
export function CallSettings() {
  const { devices, mobile, setMic, setSpeaker, setSpeakerMode } = useCall()
  const list = useMediaDevices(!mobile)
  const pickOutput = canChooseOutput()

  return (
    <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
      {mobile ? (
        <SpeakerModeSwitch mode={devices.speakerMode} onChange={setSpeakerMode} />
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Mic className="h-3.5 w-3.5" /> Microphone
            </div>
            <Select
              fullWidth
              zIndex={LIST_Z_INDEX}
              value={devices.micId}
              onChange={setMic}
              options={[{ value: '', label: 'System default' }, ...list.mics.map((d) => ({ value: d.deviceId, label: d.label }))]}
              aria-label="Microphone"
              className={selectClass}
            />
            <MicMeter />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Volume2 className="h-3.5 w-3.5" /> Speaker
            </div>
            {pickOutput ? (
              <Select
                fullWidth
                zIndex={LIST_Z_INDEX}
                value={devices.speakerId}
                onChange={setSpeaker}
                options={[{ value: '', label: 'System default' }, ...list.speakers.map((d) => ({ value: d.deviceId, label: d.label }))]}
                aria-label="Speaker"
                className={selectClass}
              />
            ) : (
              <p className="text-xs text-gray-500">This browser plays calls through your system's sound output. Change it in your computer's sound settings.</p>
            )}
          </div>
        </>
      )}
      <TestSound />
    </div>
  )
}

// Loudspeaker or earpiece, with a pill that slides to the one in use.
function SpeakerModeSwitch({ mode, onChange }: { mode: SpeakerMode; onChange: (mode: SpeakerMode) => void }) {
  const options: { value: SpeakerMode; label: string; icon: typeof Volume2 }[] = [
    { value: 'speaker', label: 'Loudspeaker', icon: Volume2 },
    { value: 'phone', label: 'Phone', icon: Smartphone },
  ]
  return (
    <div role="radiogroup" aria-label="Play the call through" className="relative grid grid-cols-2 rounded-full bg-gray-100 p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)]"
        style={{ transform: mode === 'phone' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      {options.map(({ value, label, icon: Icon }) => {
        const on = mode === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(value)}
            className={`relative flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors ${
              on ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            <Icon className={`h-4 w-4 transition-transform duration-300 ${on ? 'scale-110' : ''}`} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Lights up as you talk (the card sets --mic), so you can tell the right mic is picked.
function MicMeter() {
  return (
    <div className="flex h-2 gap-0.5" aria-hidden>
      {Array.from({ length: METER_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`call-meter-seg flex-1 rounded-full ${
            i >= METER_SEGMENTS - 2 ? 'bg-status-danger-text' : i >= METER_SEGMENTS - 4 ? 'bg-status-warning-text' : 'bg-status-success-text'
          }`}
          style={{ '--at': (i / METER_SEGMENTS).toFixed(3) } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

// Plays a short chime through the chosen output, to check you can hear it.
function TestSound() {
  const { devices, mobile } = useCall()
  const [played, setPlayed] = useState(false)
  const play = () => {
    const audio = new Audio(MESSAGE_NOTIFICATION_SOUND)
    void routeCallAudio(audio, devices, mobile).then(() => audio.play().catch(() => {}))
    setPlayed(true)
    setTimeout(() => setPlayed(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={play}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {played ? <Check className="h-3.5 w-3.5 text-status-success-text" /> : <Volume2 className="h-3.5 w-3.5" />}
      {played ? 'Playing...' : 'Test speaker'}
    </button>
  )
}
