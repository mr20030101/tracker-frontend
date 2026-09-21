// The two emails that carry a password: the one a new hire gets when their account
// is created (on accepting their application), and the one anyone gets when an
// admin or lead resets their password. Same look as the applicant email, sent in
// the name of the person who did it. Kept free of Deno and network imports so it
// can be tested on its own; index.ts sends them.

import { renderEmail, type EmailBlock, type EmailTemplate, type OutgoingEmail } from './applicant-email.ts'

export type AccountEmailKind = 'activation' | 'reset'

/**
 * The wording. Variables, replaced wherever they appear:
 *   {name}  {firstName}  the person's full name / first word of it
 *   {lead}      whoever created the account or reset the password (the email is sent in their name)
 *   {email}     the address they sign in with
 *   {password}  the temporary password
 *   {loginUrl}  the address of the sign-in page
 * The password is forced to be changed at first sign-in (see must_change_password).
 */
const signIn = (): EmailBlock => ({
    kind: 'details',
    rows: [
        { label: 'Email', value: '{email}' },
        { label: 'Temporary password', value: '{password}', code: true },
    ],
    button: { label: 'Sign in', url: '{loginUrl}' },
})

const REPLY_NOTE = 'Questions? Just reply to this email and it will go to {lead}.'

export const ACCOUNT_EMAILS: Record<AccountEmailKind, EmailTemplate> = {
    activation: {
        subject: 'Your Grey Owls Tracker account is ready',
        headline: 'Your account is ready',
        preview: 'Your sign-in details are inside.',
        blocks: [
            { kind: 'greeting', text: 'Hi {firstName},' },
            { kind: 'text', text: 'Your Grey Owls Tracker account has been created. Use these details to sign in with your temporary password.' },
            signIn(),
            { kind: 'text', text: "You'll be asked to choose your own password the first time you sign in." },
        ],
        footer: ["Sent by Grey Owls Tracker. You're receiving this because an account was created for you.", REPLY_NOTE],
    },
    reset: {
        subject: 'Your Grey Owls Tracker password was reset',
        headline: 'Your password was reset',
        preview: 'Your new temporary password is inside.',
        blocks: [
            { kind: 'greeting', text: 'Hi {firstName},' },
            { kind: 'text', text: 'Your Grey Owls Tracker password has been reset. Use these details to sign in with your new temporary password.' },
            signIn(),
            { kind: 'text', text: "You'll be asked to choose a new password when you sign in." },
            { kind: 'notice', text: "**Weren't expecting this?** Reply to this email and let {lead} know." },
        ],
        footer: ["Sent by Grey Owls Tracker. You're receiving this because your password was reset.", REPLY_NOTE],
    },
}

export interface AccountEmailInput {
    kind: AccountEmailKind
    /** Where to send it: an address the person can actually read. */
    to: string
    /** Their full name. */
    name: string
    /** The address they sign in with. */
    loginEmail: string
    password: string
    loginUrl: string
    /** Full address of the owl image for the header; '' or left out shows just the name. */
    logoUrl?: string
    /** Whoever created the account or reset the password. It is sent in their name and a reply goes to them. */
    from: { name: string; email: string }
}

export function accountEmail(input: AccountEmailInput): OutgoingEmail {
    const name = input.name.trim()
    const sender = input.from.name.trim() || 'Grey Owls Tracker'
    return {
        ...renderEmail(
            ACCOUNT_EMAILS[input.kind],
            {
                name: name || 'there',
                firstName: name.split(/\s+/)[0] || 'there',
                lead: sender,
                email: input.loginEmail,
                password: input.password,
                loginUrl: input.loginUrl,
            },
            { logoUrl: input.logoUrl },
        ),
        to: { email: input.to, name },
        fromName: sender,
        ...(input.from.email ? { replyTo: { email: input.from.email, name: sender } } : {}),
    }
}
