// Reads CHANGELOG.md into releases for the "What's new" panel. Only the shapes the changelog
// actually uses: `## version — date`, `### group`, and `- item` lines (with **bold**).
//
// "Unreleased" is left out: it describes work not in this build yet, so showing it would
// tell people about changes they can't see.

export type ReleaseGroup = { title: string; items: string[] }
export type Release = { version: string; date: string | null; notes: string[]; groups: ReleaseGroup[] }

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let group: ReleaseGroup | null = null

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (.+)$/)
    if (heading) {
      const [version, date = null] = heading[1].split(' — ').map((part) => part.trim())
      release = version === 'Unreleased' ? null : { version, date, notes: [], groups: [] }
      if (release) releases.push(release)
      group = null
      continue
    }

    if (!release) continue

    const groupHeading = line.match(/^### (.+)$/)
    if (groupHeading) {
      group = { title: groupHeading[1].trim(), items: [] }
      release.groups.push(group)
      continue
    }

    const item = line.match(/^- (.+)$/)
    if (item && group) {
      group.items.push(item[1].trim())
    } else if (line.trim() !== '' && !group) {
      release.notes.push(line.trim())
    }
  }

  return releases
}

/** "**Bold** text" as alternating plain/bold pieces, for rendering without a markdown library. */
export function boldSegments(text: string): { value: string; bold: boolean }[] {
  return text.split(/\*\*(.+?)\*\*/).map((value, index) => ({ value, bold: index % 2 === 1 }))
}
