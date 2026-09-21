// How to ask Resend to send one message. This only builds the HTTP request (and
// reads its error); index.ts makes the call. Kept free of Deno and network
// imports so the request shape can be tested on its own. It uses Resend's HTTP
// API rather than SMTP, because edge functions can't open connections on the
// SMTP ports.

import type { OutgoingEmail } from './applicant-email.ts'

export interface Sender {
    name: string
    email: string
}

export interface MailRequest {
    url: string
    headers: Record<string, string>
    body: string
}

// A display name goes in front of the address as `Name <address>`. Quotes, backslashes, angle brackets and
// line breaks would break that form, so they are dropped; and a name containing punctuation the email
// standard reserves (a full stop as in "R.", a comma, an @) must be wrapped in quotes to be valid.
const displayName = (name: string) => {
    const cleaned = name.replace(/["<>\\\r\n]/g, '').trim()
    return /[.,;:@()[\]]/.test(cleaned) ? `"${cleaned}"` : cleaned
}

export function resendRequest(apiKey: string, sender: Sender, email: OutgoingEmail): MailRequest {
    return {
        url: 'https://api.resend.com/emails',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            // From the lead's name when there is one, at the configured address.
            from: `${displayName(email.fromName ?? '') || displayName(sender.name)} <${sender.email}>`,
            // Just the address: an applicant-supplied name in the To header could break it.
            to: [email.to.email],
            ...(email.replyTo ? { reply_to: email.replyTo.email } : {}),
            subject: email.subject,
            html: email.html,
            text: email.text,
        }),
    }
}

/** The reason Resend gave for refusing a message (it puts it in `message`), or a plain fallback. */
export function resendError(status: number, detail: unknown): string {
    const message = (detail as { message?: unknown } | null)?.message
    return typeof message === 'string' && message ? message : `Resend responded with status ${status}.`
}
