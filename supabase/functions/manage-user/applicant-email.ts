// The email sent to accepted applicants, and the rules for sending it to a
// selection of them. Kept free of Deno and network imports so it can be tested
// on its own; index.ts wires it to the database and to Resend.
//
// It is deliberately a plain personal note, not a designed newsletter: it is
// written in one person's voice and goes out under the sending lead's name, so
// it looks like something that person typed. No header, boxes, buttons or footer.

export interface EmailTemplate {
    subject: string
    /**
     * Plain text. A blank line starts a new paragraph, a single line break is kept,
     * **bold** is bold, and web addresses become links.
     */
    body: string
}

/**
 * What an accepted applicant receives: the Remotasks Bootcamp orientation notice.
 * This is announcement text (a date, a time and a Google Meet link), so it has to
 * be edited here, and the function redeployed, for each new bootcamp.
 *
 * Any text can use these variables, replaced wherever they appear:
 *   {name}       the applicant's full name
 *   {firstName}  the first word of their name
 *   {lead}       the name of the lead they applied to
 *   {email}      the email they sign in with (their Remotasks email)
 *   {loginUrl}   the address of the sign-in page
 * While this is null the function refuses to send anything.
 */
export const APPLICANT_EMAIL: EmailTemplate | null = {
    subject: 'Remotasks Bootcamp: Free Orientation on September 22, 2026, 9:00 AM PH Time',
    body: [
        "Good day, Ma'am/Sir!",
        'This is Jay-Anne from Remotasks Bootcamp. I would like to inform you that our Free Orientation Bootcamp will begin tomorrow, **September 22, 2026 (Tuesday), 9:00 AM PH Time**.',
        'Please make sure to join on time. The Google Meet will only accept participants until **9:10 AM**. Late submissions/attendance will not be accepted.',
        '**Project:** ALOHA OTS\n**Training Google Meet:** https://meet.google.com/azw-dsgv-hpd?authuser=0&hl=en',
        'Thank you, and see you tomorrow!\nJay-Anne',
    ].join('\n\n'),
}

/** The address of a site as typed into the SITE_URL secret: adds https:// if it was left off and drops trailing slashes. '' when there is none. */
export function siteFrom(site: string): string {
    const trimmed = site.trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export const MAX_RECIPIENTS = 50
const CONCURRENCY = 5

const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderedEmail {
    subject: string
    text: string
    html: string
}

/**
 * Fills the variables in and produces a plain-text and an HTML version.
 * Applicant-supplied values are escaped in the HTML and can't add lines to the subject.
 * The HTML sets a font and spacing but no colours or background, so a mail app's own
 * light or dark theme applies, exactly as it does to a message someone typed.
 */
export function renderEmail(template: EmailTemplate, vars: Record<string, string>): RenderedEmail {
    // Unknown {placeholders} are left as written, so a typo in the template is visible rather than silently blank.
    const fill = (text: string, clean: (value: string) => string) =>
        text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? clean(vars[key]) : whole))
    // Escape first, then fill: the braces survive escaping, and each value is escaped as it goes in.
    const rich = (text: string) =>
        fill(escapeHtml(text), escapeHtml)
            .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>')

    const subject = fill(template.subject, (value) => value.replace(/[\r\n]+/g, ' ')).trim()
    const text = fill(template.body, (value) => value).replace(/\*\*(.+?)\*\*/g, '$1')
    const paragraphs = template.body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p style="margin:0 0 15px">${rich(paragraph)}</p>`)

    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;max-width:640px">
${paragraphs.join('\n')}
</div>
</body>
</html>`

    return { subject, text, html }
}

export interface ApplicationRow {
    id: number
    lead_id: string
    full_name: string
    active_email: string
    remotasks_email: string
    status: string
}

export interface OutgoingEmail extends RenderedEmail {
    to: { email: string; name: string }
    /** The name shown as the sender. The address stays the configured one. */
    fromName?: string
    replyTo?: { email: string; name: string }
}

export interface Caller {
    id: string
    role: string
}

export interface Deps {
    /** The rows found for the requested ids (a missing id is simply absent). */
    applications: ApplicationRow[]
    leads: Map<string, { name: string; email: string }>
    template: EmailTemplate | null
    loginUrl: string
    /** Sends one email; throws when it can't. */
    send: (email: OutgoingEmail) => Promise<void>
}

export type Outcome =
    | { ok: true; sent: number[]; failed: { id: number; name: string; error: string }[] }
    | { ok: false; status: number; error: string }

const fail = (status: number, error: string): Outcome => ({ ok: false, status, error })

/**
 * Emails each of the requested applicants. Only accepted applicants can be
 * emailed, and a lead can only email their own; an admin can email anyone's.
 * Nothing is sent unless every request passes those checks, but once sending
 * starts one bad address doesn't stop the rest: the result lists who got it and
 * who didn't.
 */
export async function emailApplicants(requestedIds: number[], caller: Caller, deps: Deps): Promise<Outcome> {
    const ids = [...new Set(requestedIds)]
    if (ids.length === 0) return fail(400, 'Choose at least one applicant to email.')
    if (ids.length > MAX_RECIPIENTS) return fail(400, `Choose at most ${MAX_RECIPIENTS} applicants at a time.`)
    if (!deps.template) return fail(409, "The email to send hasn't been set up yet.")

    const byId = new Map(deps.applications.map((application) => [application.id, application]))
    if (ids.some((id) => !byId.has(id))) return fail(404, 'One or more of those applications no longer exists.')

    const rows = ids.map((id) => byId.get(id)!)
    if (caller.role !== 'admin' && rows.some((row) => row.lead_id !== caller.id)) {
        return fail(403, 'Forbidden: you can only email your own applicants.')
    }
    const notAccepted = rows.filter((row) => row.status !== 'accepted')
    if (notAccepted.length) {
        return fail(422, `Only accepted applicants can be emailed. Not accepted: ${notAccepted.map((row) => row.full_name).join(', ')}.`)
    }

    const template = deps.template
    const sent: number[] = []
    const failed: { id: number; name: string; error: string }[] = []

    async function deliver(row: ApplicationRow) {
        const lead = deps.leads.get(row.lead_id)
        const vars = {
            name: row.full_name,
            firstName: row.full_name.trim().split(/\s+/)[0] ?? row.full_name,
            lead: lead?.name ?? '',
            email: row.remotasks_email,
            loginUrl: deps.loginUrl,
        }
        try {
            await deps.send({
                ...renderEmail(template, vars),
                to: { email: row.active_email, name: row.full_name },
                // It arrives from the lead's name, and a reply goes to the lead, not to the sending address.
                ...(lead ? { fromName: lead.name, replyTo: { email: lead.email, name: lead.name } } : {}),
            })
            sent.push(row.id)
        } catch (error) {
            failed.push({ id: row.id, name: row.full_name, error: error instanceof Error ? error.message : String(error) })
        }
    }

    // A few at a time: quick for a whole team, gentle on the provider's rate limit.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(rows.slice(i, i + CONCURRENCY).map(deliver))
    }
    return { ok: true, sent, failed }
}
