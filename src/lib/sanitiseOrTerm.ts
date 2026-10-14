// Characters PostgREST treats specially inside or() filter expressions:
// ( ) delimit groups, , separates conditions, % is the ilike wildcard, " is a quoting delimiter.
const OR_SPECIAL = /[%,()"]/g

export function sanitiseOrTerm(input: string): string {
  return input.trim().replace(OR_SPECIAL, '')
}
