// Creating the tracker account for an accepted applicant. This is its own step, done
// on purpose after accepting: accepting only records the decision. Kept free of Deno
// and network imports so it can be tested on its own; index.ts wires it to Supabase.

export interface AccountApplication {
    id: number
    lead_id: string
    full_name: string
    active_email: string
    remotasks_email: string
    status: string
    /** Set once an account exists for this applicant. */
    user_id: string | null
}

export interface Caller {
    id: string
    role: string
}

export interface EmailStatus {
    emailed_to?: string
    email_error?: string
}

export interface CreateAccountDeps {
    /** The application with the requested id, or null when there is none. */
    application: AccountApplication | null
    newPassword: () => string
    /** Creates the sign-in. Returns its id, or the reason it couldn't be created. */
    createLogin: (input: { email: string; password: string; name: string }) => Promise<{ id: string } | { error: string }>
    /** Undoes createLogin. */
    removeLogin: (userId: string) => Promise<void>
    /** Creates the profile that puts them on the lead's team. Returns an error message, or null when it worked. */
    saveProfile: (input: { id: string; name: string; email: string; lead_id: string }) => Promise<string | null>
    /** Records the account on the application, only if it still has none. `linked` is false when someone else got there first. */
    linkApplication: (applicationId: number, userId: string) => Promise<{ linked: boolean } | { error: string }>
    /** Emails them their details. It never throws: the account exists whether or not the email goes out. */
    notify: (input: { to: string; name: string; loginEmail: string; password: string }) => Promise<EmailStatus>
}

export type CreateAccountOutcome =
    | ({ ok: true; id: number; user_id: string; email: string; temporary_password: string } & EmailStatus)
    | { ok: false; status: number; error: string }

const fail = (status: number, error: string): CreateAccountOutcome => ({ ok: false, status, error })

/**
 * Creates the login and profile for one accepted applicant, on their lead's team, with a
 * temporary password they must change at first sign-in, and emails them the details.
 * Only an accepted applicant without an account can get one, and a lead can only do this
 * for their own applicants; an admin can for anyone's. If any write fails the login is
 * removed again, so the same button can simply be pressed once more.
 */
export async function createAccount(caller: Caller, deps: CreateAccountDeps): Promise<CreateAccountOutcome> {
    const application = deps.application
    if (!application) return fail(404, 'Application not found.')
    if (caller.role !== 'admin' && application.lead_id !== caller.id) {
        return fail(403, 'Forbidden: this application belongs to another lead.')
    }
    if (application.status === 'pending') return fail(409, 'Accept this application before creating an account for it.')
    if (application.status !== 'accepted') return fail(409, `This application was ${application.status}, so no account can be created.`)
    if (application.user_id) return fail(409, 'An account has already been created for this applicant.')

    // The login is the applicant's Remotasks email: tasks are matched to a contributor
    // by profiles.email = cb_email, so their submissions attach to this account.
    const email = application.remotasks_email
    const password = deps.newPassword()
    const login = await deps.createLogin({ email, password, name: application.full_name })
    if ('error' in login) return fail(422, `Could not create a login for ${email}: ${login.error}`)
    const userId = login.id

    const profileError = await deps.saveProfile({ id: userId, name: application.full_name, email, lead_id: application.lead_id })
    if (profileError) {
        await deps.removeLogin(userId)
        return fail(400, `Profile creation failed: ${profileError}`)
    }

    const link = await deps.linkApplication(application.id, userId)
    if ('error' in link) {
        await deps.removeLogin(userId)
        return fail(400, `Could not link the account to this application: ${link.error}`)
    }
    if (!link.linked) {
        await deps.removeLogin(userId)
        return fail(409, 'An account has already been created for this applicant.')
    }

    const emailStatus = await deps.notify({ to: application.active_email, name: application.full_name, loginEmail: email, password })
    return { ok: true, id: application.id, user_id: userId, email, temporary_password: password, ...emailStatus }
}
