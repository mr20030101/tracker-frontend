// The two emails that carry a password: the one a new hire gets when their account
// is created (on accepting their application), and the one anyone gets when an
// admin or lead resets their password. Plain personal notes like the applicant
// email, in the name of the person who did it. Kept free of Deno and network
// imports so it can be tested on its own; index.ts sends them.

import { renderEmail, type EmailTemplate, type OutgoingEmail } from './applicant-email.ts'

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
export const ACCOUNT_EMAILS: Record<AccountEmailKind, EmailTemplate> = {
    activation: {
        subject: 'Your Grey Owls Tracker account is ready',
        body: [
            'Hi {firstName},',
            'Your Grey Owls Tracker account has been created. Here are your sign-in details:',
            '**Sign in:** {loginUrl}\n**Email:** {email}\n**Temporary password:** {password}',
            "You'll be asked to choose your own password the first time you sign in.",
            'If you have any questions, just reply to this email.',
            '{lead}',
        ].join('\n\n'),
    },
    reset: {
        subject: 'Your Grey Owls Tracker password was reset',
        body: [
            'Hi {firstName},',
            'Your Grey Owls Tracker password has been reset. Here are your new sign-in details:',
            '**Sign in:** {loginUrl}\n**Email:** {email}\n**Temporary password:** {password}',
            "You'll be asked to choose a new password when you sign in. If you weren't expecting this, reply to this email and let me know.",
            '{lead}',
        ].join('\n\n'),
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
    /** Whoever created the account or reset the password. It is sent in their name and a reply goes to them. */
    from: { name: string; email: string }
}

export function accountEmail(input: AccountEmailInput): OutgoingEmail {
    const name = input.name.trim()
    const sender = input.from.name.trim() || 'Grey Owls Tracker'
    return {
        ...renderEmail(ACCOUNT_EMAILS[input.kind], {
            name: name || 'there',
            firstName: name.split(/\s+/)[0] || 'there',
            lead: sender,
            email: input.loginEmail,
            password: input.password,
            loginUrl: input.loginUrl,
        }),
        to: { email: input.to, name },
        fromName: sender,
        ...(input.from.email ? { replyTo: { email: input.from.email, name: sender } } : {}),
    }
}
