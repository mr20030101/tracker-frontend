// The email sent to accepted applicants, the layout every email from the tracker
// shares, and the rules for sending the applicant email to a selection of people.
// Kept free of Deno and network imports so it can be tested on its own; index.ts
// wires it to the database and to Resend.
//
// The look: a dark header band with the owl and the name, a yellow rule, a headline,
// the message, a yellow details card holding the one action button, a red notice for
// anything the reader must not miss, and a small footer under the card saying why
// they got it and who a reply goes to.

/** One line of a details card, such as "When: Tuesday, 9:00 AM". */
export interface EmailRow {
    label: string
    value: string
    /** Set the value in a monospace face (for a password, so 0/O and l/1 can be told apart). */
    code?: boolean
}

export interface EmailButton {
    label: string
    /** Where it goes. Only http(s) addresses get a button; anything else leaves the button out. */
    url: string
}

/**
 * The pieces a message is made of, top to bottom. Text in any of them can use
 * **bold**, contains web addresses that become links, keeps single line breaks,
 * and can use {variables}.
 */
export type EmailBlock =
    /** A bold opening line, like "Good day, Ma'am/Sir!". */
    | { kind: 'greeting'; text: string }
    | { kind: 'text'; text: string }
    /** The yellow card: labelled rows, and the button with its paste-this-link fallback under them. */
    | { kind: 'details'; rows: EmailRow[]; button?: EmailButton }
    /** The red callout, for a warning or a deadline. */
    | { kind: 'notice'; text: string }

export interface EmailTemplate {
    subject: string
    headline: string
    /** The grey preview line some mail apps show beside the subject. Not shown in the message itself. */
    preview?: string
    blocks: EmailBlock[]
    /** The small print under the card, one entry per line. */
    footer: string[]
}

const REPLY_NOTE = 'Questions? Just reply to this email and it will go to {lead}.'

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
    headline: 'Free Orientation Bootcamp',
    preview: 'Starts tomorrow, September 22, 2026 at 9:00 AM PH Time. Please join on time.',
    blocks: [
        { kind: 'greeting', text: "Good day, Ma'am/Sir!" },
        {
            kind: 'text',
            text: 'This is Jay-Anne from Remotasks Bootcamp. I would like to inform you that our Free Orientation Bootcamp will begin tomorrow, September 22, 2026 (Tuesday), 9:00 AM PH Time.',
        },
        {
            kind: 'details',
            rows: [
                { label: 'When', value: 'Tuesday, September 22, 2026 · 9:00 AM PH Time' },
                { label: 'Project', value: 'ALOHA OTS' },
                { label: 'Where', value: 'Training Google Meet' },
            ],
            button: { label: 'Join the Google Meet', url: 'https://meet.google.com/azw-dsgv-hpd?authuser=0&hl=en' },
        },
        {
            kind: 'notice',
            text: '**Please make sure to join on time.** The Google Meet will only accept participants until 9:10 AM. Late submissions/attendance will not be accepted.',
        },
        { kind: 'text', text: 'Thank you, and see you tomorrow!\nJay-Anne' },
    ],
    footer: ["Sent by Grey Owls Tracker. You're receiving this because you applied and were accepted.", REPLY_NOTE],
}

/** The address of a site as typed into the SITE_URL secret: adds https:// if it was left off and drops trailing slashes. '' when there is none. */
export function siteFrom(site: string): string {
    const trimmed = site.trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** The owl shown in the header. It is served by the site itself (public/images/greyowls/icons). */
export const LOGO_PATH = '/images/greyowls/icons/icon-192.png'
/** The full address of the owl for a site address from siteFrom, or '' when the site is unknown (the header then shows just the name). */
export const logoFrom = (site: string) => (site ? `${site}${LOGO_PATH}` : '')

export const MAX_RECIPIENTS = 50
const CONCURRENCY = 5

const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface RenderedEmail {
    subject: string
    text: string
    html: string
}

export interface RenderOptions {
    /** Full address of the owl image for the header. Leave out to show the name alone. */
    logoUrl?: string
}

// Brand colours, from public/images/greyowls/brand-tokens.css.
const INK = '#32373F'
const SLATE = '#5A626D'
const BEACON = '#F5B301'
const EMBER = '#8A6200'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

/**
 * Fills the variables in and produces the plain-text and HTML versions.
 * Applicant-supplied values are escaped in the HTML and can't add lines to the subject.
 */
export function renderEmail(template: EmailTemplate, vars: Record<string, string>, options: RenderOptions = {}): RenderedEmail {
    // Values are dropped in LAST, after all formatting, so nothing in a value is ever treated as
    // formatting: a password like "a**b**c" or "https://x" reaches the reader exactly as it is.
    // Unknown {placeholders} are left as written, so a typo in the template is visible rather than silently blank.
    const fill = (text: string, clean: (value: string, key: string) => string) =>
        text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? clean(vars[key], key) : whole))
    const plain = (text: string) => fill(text, (value) => value)
    const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value)
    // In the HTML a value is escaped, and a web address in a *Url variable (like {loginUrl}) becomes a link.
    const htmlValue = (value: string, key: string) =>
        key.endsWith('Url') && isWebAddress(value) ? `<a href="${escapeHtml(value)}" style="color:${EMBER}">${escapeHtml(value)}</a>` : escapeHtml(value)
    const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ')
    const rich = (text: string) =>
        fill(
            escapeHtml(text)
                .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color:${EMBER}">$1</a>`)
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>'),
            htmlValue,
        )
    const unbold = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1')

    const subject = fill(template.subject, (value) => oneLine(value)).trim()
    const headline = fill(template.headline, (value) => oneLine(value)).trim()

    // A button only exists when its address, once filled in, is a real web address.
    const linkOf = (button?: EmailButton) => {
        if (!button) return null
        const url = plain(button.url).trim()
        return isWebAddress(url) ? { label: plain(button.label), url } : null
    }

    const textParts: string[] = [headline]
    const htmlParts: string[] = []
    const paragraph = 'margin:0 0 16px;font-size:14px;line-height:1.6;color:' + INK

    for (const block of template.blocks) {
        if (block.kind === 'greeting') {
            textParts.push(plain(unbold(block.text)))
            htmlParts.push(`<p style="${paragraph};font-weight:700">${rich(block.text)}</p>`)
        } else if (block.kind === 'text') {
            textParts.push(plain(unbold(block.text)))
            htmlParts.push(`<p style="${paragraph}">${rich(block.text)}</p>`)
        } else if (block.kind === 'notice') {
            textParts.push(plain(unbold(block.text)))
            htmlParts.push(
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="background:#FFEDEA;border-left:3px solid #E5534B;border-radius:8px;padding:14px 18px;font-size:14px;line-height:1.6;color:${INK}">${rich(block.text)}</td></tr></table>`,
            )
        } else {
            const link = linkOf(block.button)
            const lines = block.rows.map((row) => `${plain(row.label)}: ${plain(row.value)}`)
            if (link) lines.push(`${link.label}: ${link.url}`)
            textParts.push(lines.join('\n'))

            // The label column is as wide as the longest word in any label (a longer label wraps), so the values get the rest.
            const labelWidth = Math.ceil(Math.max(...block.rows.flatMap((row) => row.label.split(/\s+/).map((word) => word.length)), 4) * 7.5)
            const rows = block.rows
                .map((row) => {
                    const value = fill(escapeHtml(row.value), htmlValue)
                    const shown = row.code
                        ? `<span style="font-family:${MONO};font-size:15px;letter-spacing:.02em;word-break:break-all">${value}</span>`
                        : value
                    return `<tr><td class="row-label" width="${labelWidth}" valign="top" style="padding:6px 10px 4px 0;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${SLATE}">${fill(escapeHtml(row.label), htmlValue)}</td><td class="row-value" valign="top" style="padding:3px 0;font-size:13px;line-height:1.5;font-weight:600;color:${INK}">${shown}</td></tr>`
                })
                .join('')
            const action = link
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr><td style="background:${BEACON};border-radius:8px"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#1A1500;text-decoration:none">${escapeHtml(link.label)}</a></td></tr></table>` +
                  `<p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:${SLATE}">Or paste this link into your browser:<br><a href="${escapeHtml(link.url)}" style="color:${EMBER};word-break:break-all">${escapeHtml(link.url)}</a></p>`
                : ''
            htmlParts.push(
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="background:#FEF6D8;border-left:3px solid ${BEACON};border-radius:8px;padding:16px 16px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${action}</td></tr></table>`,
            )
        }
    }

    const footer = template.footer.map((line) => plain(line))
    const preview = template.preview ? plain(template.preview) : ''

    const text = [...textParts, ...(footer.length ? [`--\n${footer.join('\n')}`] : [])].join('\n\n')

    const logo = options.logoUrl && isWebAddress(options.logoUrl)
        ? `<td width="28" style="padding-right:12px"><img src="${escapeHtml(options.logoUrl)}" width="28" height="28" alt="" style="display:block;border:0;border-radius:6px"></td>`
        : ''

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
<style>
@media (max-width:440px) {
  .outer { padding:16px 8px !important }
  .pad { padding:24px 20px 26px !important }
  .row-label, .row-value { display:block !important; width:auto !important }
  .row-label { padding-bottom:0 !important }
  .row-value { padding-bottom:8px !important }
}
</style>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:${FONT}">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preview)}</div>\n` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6"><tr><td class="outer" align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #DCDFE4;border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td style="background:${INK};border-bottom:3px solid ${BEACON};padding:16px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}<td style="font-size:15px;font-weight:700;color:#FFFFFF">Grey Owls Tracker</td></tr></table></td></tr>
<tr><td class="pad" style="padding:28px 30px 14px">
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;font-weight:700;color:${INK}">${escapeHtml(headline)}</h1>
${htmlParts.join('\n')}
</td></tr>
</table>
${footer.length ? `<p style="max-width:480px;margin:18px auto 0;font-size:11px;line-height:1.6;color:${SLATE};text-align:center">${footer.map(escapeHtml).join('<br>')}</p>\n` : ''}</td></tr></table>
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
    /** Full address of the owl image for the header; '' when the site address isn't known. */
    logoUrl?: string
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
            lead: lead?.name ?? 'Grey Owls Tracker',
            email: row.remotasks_email,
            loginUrl: deps.loginUrl,
        }
        try {
            await deps.send({
                ...renderEmail(template, vars, { logoUrl: deps.logoUrl }),
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
