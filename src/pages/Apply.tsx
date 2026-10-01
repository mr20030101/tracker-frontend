import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircuitBoard, Cpu, IdCard, Link as LinkIcon, Mail, MailCheck, MemoryStick, User } from 'lucide-react'
import {
  describeIssues,
  fetchApplicationLead,
  normalizeProfileUrl,
  requirementIssues,
  submitApplication,
  type ApplicationInput,
} from '../lib/hiring'
import { useReveal } from '../lib/motion'
import { fetchVisitorCountry } from '../lib/geo'
import { CardHeading, PerchedCard } from '../components/PerchedCard'
import { ErrorNote, PlayfulInput, PlayfulSwitch, SubmitButton, YesNoPills } from '../components/PlayfulForm'

// Same staggered entrance as the login card: everything above the form, then each field in turn.
const REVEAL = { selector: ':scope > :not(form), :scope > form > *', step: 60 }

type YesNo = '' | 'yes' | 'no'

const emptyForm = {
  // Step 1: personal information. The Remotasks details are optional, behind a "have an account" switch.
  has_remotasks: false,
  remotasks_email: '',
  remotasks_id: '',
  full_name: '',
  active_email: '',
  facebook_url: '',
  robotics: '' as YesNo,
  // Step 2: the applicant's computer
  personal_computer: '' as YesNo,
  stable_internet: '' as YesNo,
  cpu: '',
  gpu: '',
  gpu_memory_gb: '',
}

type FormState = typeof emptyForm
type TextField = Exclude<keyof FormState, 'has_remotasks'>
type SetField = (field: TextField) => (e: { target: { value: string } }) => void

const STEP_TITLES = ['Personal information', 'Your computer']

// Where applicants without a Remotasks account sign up first.
const REMOTASKS_SIGNUP_URL = 'https://www.remotasks.com/en'

// Applications are open to people in the Philippines only (checked by IP address, see api/country.ts).
const ELIGIBLE_COUNTRY = 'PH'

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6">
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
        Step {step} of {STEP_TITLES.length} · {STEP_TITLES[step - 1]}
      </p>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {STEP_TITLES.map((title, i) => (
          <div key={title} className={`h-2 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-gray-200'}`} />
        ))}
      </div>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  return message ? <ErrorNote message={message} /> : null
}

function PersonalStep({
  form,
  set,
  setHasRemotasks,
  error,
  onNext,
}: {
  form: FormState
  set: SetField
  setHasRemotasks: (value: boolean) => void
  error: string | null
  onNext: (e: FormEvent) => void
}) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  return (
    <div ref={ref}>
      <CardHeading title="Join the flock!" subtitle="Robotics Project Application" />
      <StepIndicator step={1} />
      <form onSubmit={onNext} className="flex flex-col gap-4">
        <PlayfulInput id="full_name" label="Full Name" icon={User} maxLength={200} value={form.full_name} onChange={set('full_name')} />
        <PlayfulInput id="active_email" label="Active Email" icon={MailCheck} type="email" maxLength={254} value={form.active_email} onChange={set('active_email')} />
        <PlayfulInput
          id="facebook_url"
          label="Facebook Profile Link"
          icon={LinkIcon}
          hint="Used to add you to the group chat. Your profile must be set to public and have a profile picture. Please do not put N/A."
          highlightHint
          placeholder="https://facebook.com/your.profile"
          maxLength={500}
          value={form.facebook_url}
          onChange={set('facebook_url')}
        />
        <YesNoPills legend="Do you have a background working on Robotics?" name="robotics" value={form.robotics} onChange={set('robotics')} />
        <PlayfulSwitch
          id="has_remotasks"
          label="I already have a Remotasks account"
          checked={form.has_remotasks}
          onChange={setHasRemotasks}
        />
        {form.has_remotasks ? (
          <>
            <PlayfulInput id="remotasks_email" label="Remotasks Email" icon={Mail} optional type="email" maxLength={254} value={form.remotasks_email} onChange={set('remotasks_email')} />
            <PlayfulInput id="remotasks_id" label="Remotasks ID" icon={IdCard} optional maxLength={200} value={form.remotasks_id} onChange={set('remotasks_id')} />
          </>
        ) : (
          <p className="rounded-xl bg-accent-bg/60 px-3 py-2 text-center text-sm text-accent-foreground">
            No Remotasks account yet?{' '}
            <a href={REMOTASKS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Create one on Remotasks
            </a>
            . You can still apply without one.
          </p>
        )}
        <FormError message={error} />
        <SubmitButton pending={false} label="Next" pendingLabel="Next" />
      </form>
    </div>
  )
}

// The optional processor and graphics questions only appear when the applicant
// says they have a personal computer. They rise in one after another, like the
// rest of the form.
function ComputerDetails({ form, set }: { form: FormState; set: SetField }) {
  const ref = useReveal<HTMLDivElement>({ step: 60 })
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <PlayfulInput
        id="cpu"
        label="Processor (CPU)"
        icon={Cpu}
        optional
        placeholder="e.g. Ryzen 5 3600 or Intel Core i5-10400"
        maxLength={200}
        value={form.cpu}
        onChange={set('cpu')}
      />
      <PlayfulInput
        id="gpu"
        label="Graphics card (GPU)"
        icon={CircuitBoard}
        optional
        placeholder="e.g. NVIDIA GTX 1650"
        maxLength={200}
        value={form.gpu}
        onChange={set('gpu')}
      />
      <PlayfulInput
        id="gpu_memory_gb"
        label="GPU memory (GB)"
        icon={MemoryStick}
        optional
        hint="Enter 0 if you have no dedicated GPU."
        type="number"
        min={0}
        max={256}
        step="any"
        inputMode="decimal"
        placeholder="4"
        value={form.gpu_memory_gb}
        onChange={set('gpu_memory_gb')}
      />
    </div>
  )
}

function ComputerStep({
  form,
  set,
  error,
  pending,
  onBack,
  onSubmit,
}: {
  form: FormState
  set: SetField
  error: string | null
  pending: boolean
  onBack: () => void
  onSubmit: (e: FormEvent) => void
}) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  const hasComputer = form.personal_computer === 'yes'
  // A heads-up only: the lead decides, and the CPU is free text that can't be checked here.
  // GPU memory only counts while its field is showing.
  const issues = requirementIssues({
    has_personal_computer: form.personal_computer ? hasComputer : null,
    has_stable_internet: form.stable_internet ? form.stable_internet === 'yes' : null,
    gpu_memory_gb: hasComputer && form.gpu_memory_gb.trim() !== '' ? Number(form.gpu_memory_gb) : null,
  })

  return (
    <div ref={ref}>
      <CardHeading title="Almost there!" subtitle="Robotics Project Application" />
      <StepIndicator step={2} />
      <div className="mb-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Requirements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Must have a personal computer and a stable internet connection</li>
          <li>Minimum specs: Ryzen 3 / Intel i5 with at least 4GB GPU</li>
        </ul>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <YesNoPills legend="Do you have a personal computer?" name="personal_computer" value={form.personal_computer} onChange={set('personal_computer')} />
        <YesNoPills legend="Do you have a stable internet connection?" name="stable_internet" value={form.stable_internet} onChange={set('stable_internet')} />
        {hasComputer && <ComputerDetails form={form} set={set} />}
        {issues.length > 0 && (
          <div role="status" className="rounded-xl bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
            Your answers are below the requirements ({describeIssues(issues)}). You can still submit, but your lead may not be
            able to accept your application.
          </div>
        )}
        <FormError message={error} />
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 rounded-xl border-2 border-gray-200 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
          <div className="flex flex-1 flex-col">
            <SubmitButton pending={pending} label="Submit application" pendingLabel="Submitting..." />
          </div>
        </div>
      </form>
    </div>
  )
}

function Submitted({ name }: { name: string }) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  return (
    <div ref={ref} role="status">
      <CardHeading
        title="Hoo-ray, you're in!"
        subtitle={`Thanks, ${name}. Your lead will review your application and be in touch through the active email you gave.`}
      />
    </div>
  )
}

function ApplicationForm({ leadId }: { leadId: string }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const submitMutation = useMutation({
    mutationFn: (input: ApplicationInput) => submitApplication(leadId, input),
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not submit your application.'),
  })

  // Each step is taller than the viewport on a phone; start it from the top.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const set: SetField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const facebookError = 'Please enter a link to your Facebook profile. "N/A" is not accepted.'

  function handleNext(e: FormEvent) {
    e.preventDefault()
    if (!normalizeProfileUrl(form.facebook_url)) {
      setError(facebookError)
      return
    }
    setError(null)
    setStep(2)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const facebookUrl = normalizeProfileUrl(form.facebook_url)
    if (!facebookUrl) {
      setError(facebookError)
      setStep(1)
      return
    }
    // CPU, GPU and GPU memory are optional, and only asked of someone with a computer:
    // a blank answer, or anything typed before switching to No, is sent as null.
    const hasComputer = form.personal_computer === 'yes'
    const gpuMemory = hasComputer && form.gpu_memory_gb.trim() !== '' ? Number(form.gpu_memory_gb) : null
    if (gpuMemory !== null && !Number.isFinite(gpuMemory)) {
      setError('Please enter your GPU memory in GB.')
      return
    }
    setError(null)
    submitMutation.mutate({
      // Only sent when the switch is on, so anything typed before switching it off is dropped.
      remotasks_email: form.has_remotasks ? form.remotasks_email.trim() : '',
      remotasks_id: form.has_remotasks ? form.remotasks_id.trim() : '',
      full_name: form.full_name,
      active_email: form.active_email,
      facebook_url: facebookUrl,
      has_robotics_background: form.robotics === 'yes',
      has_personal_computer: hasComputer,
      has_stable_internet: form.stable_internet === 'yes',
      cpu: (hasComputer && form.cpu.trim()) || null,
      gpu: (hasComputer && form.gpu.trim()) || null,
      gpu_memory_gb: gpuMemory,
    })
  }

  if (submitMutation.isSuccess) return <Submitted name={form.full_name.trim()} />

  if (step === 1) {
    return (
      <PersonalStep
        form={form}
        set={set}
        setHasRemotasks={(value) => setForm((prev) => ({ ...prev, has_remotasks: value }))}
        error={error}
        onNext={handleNext}
      />
    )
  }

  return (
    <ComputerStep
      form={form}
      set={set}
      error={error}
      pending={submitMutation.isPending}
      onBack={() => {
        setError(null)
        setStep(1)
      }}
      onSubmit={handleSubmit}
    />
  )
}

// A centred title and message, for the screens shown instead of the form.
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{children}</p>
    </div>
  )
}

// Public page a lead shares with applicants: no sign-in, so it talks to the
// database only through the hiring RPCs (see supabase/schema.sql).
export function Apply() {
  const { leadId = '' } = useParams()
  // The owl watches whichever field is being filled in, following the text as it grows (like the
  // login page). Handled here, around the whole card, so the form steps don't need to know.
  // The update waits a frame: re-rendering this page while a keystroke is still being handled made
  // React put the input's old value back before its onChange ran, so the typing was lost.
  const [look, setLook] = useState({ x: 0, y: 0 })
  const watchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const area = watchRef.current
    if (!area) return
    let frame = 0
    const later = (next: { x: number; y: number }) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLook(next))
    }
    function watch(e: Event) {
      const field = e.target
      if (!(field instanceof HTMLInputElement)) return
      const length = field.type === 'radio' || field.type === 'checkbox' ? 14 : field.value.length
      later({ x: Math.min(length / 28, 1) * 2 - 1, y: 1 })
    }
    const rest = () => later({ x: 0, y: 0 })
    area.addEventListener('focusin', watch)
    area.addEventListener('input', watch)
    area.addEventListener('focusout', rest)
    return () => {
      cancelAnimationFrame(frame)
      area.removeEventListener('focusin', watch)
      area.removeEventListener('input', watch)
      area.removeEventListener('focusout', rest)
    }
  }, [])

  const { data: lead, isLoading, error: leadError } = useQuery({
    queryKey: ['application-lead', leadId],
    queryFn: () => fetchApplicationLead(leadId),
    retry: false,
  })

  // If the country can't be told (null), the form stays open rather than turning away
  // someone who may well be eligible; only a known non-Philippines address is blocked.
  const { data: country, isLoading: countryLoading } = useQuery({
    queryKey: ['visitor-country'],
    queryFn: fetchVisitorCountry,
    retry: false,
    staleTime: Infinity,
  })
  const eligible = !country || country === ELIGIBLE_COUNTRY

  let content
  if (isLoading || countryLoading) {
    content = <p className="text-center text-sm text-gray-400">Loading...</p>
  } else if (leadError) {
    content = (
      <ErrorNote message="Could not load this application form. Please try again later." />
    )
  } else if (!lead) {
    content = (
      <Notice title="Link not valid">This application link isn't active. Ask the person who sent it for a new one.</Notice>
    )
  } else if (!lead.accepting) {
    content = (
      <Notice title="Applications are closed">
        {lead.name} isn't accepting applications right now. Please check back later or ask them directly.
      </Notice>
    )
  } else if (!eligible) {
    content = (
      <Notice title="Not eligible">
        Sorry, this project is only open to applicants based in the Philippines, so we can't accept an application from
        your location.
        <span className="mt-2 block">If you are in the Philippines and using a VPN, turn it off and reload this page.</span>
      </Notice>
    )
  } else {
    content = <ApplicationForm leadId={leadId} />
  }

  return (
    <PerchedCard lookX={look.x} lookY={look.y} maxWidthClassName="max-w-md">
      <div ref={watchRef}>
        {content}
      </div>
    </PerchedCard>
  )
}
