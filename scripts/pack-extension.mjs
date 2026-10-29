// Packs the browser extension (extension/) into a zip to hand to the team:
// extension-build/grey-owls-tracker-extension-v<version>.zip, named by the version in
// extension/manifest.json, and a copy at public/downloads/grey-owls-tracker-extension.zip, which
// the site serves for the download on the Resources page (BrowserExtensionCard). They unzip it and
// load the folder with Load unpacked (see extension/README.md); a .crx from outside the Chrome Web
// Store won't install on Mac or Windows.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8'))
const outDir = join(root, 'extension-build')
const zipName = `grey-owls-tracker-extension-v${version}.zip`
const zipPath = join(outDir, zipName)

mkdirSync(outDir, { recursive: true })
rmSync(zipPath, { force: true })
// Zipped as a folder named grey-owls-tracker, so unzipping gives one folder to pick in Load unpacked.
const staging = join(outDir, 'grey-owls-tracker')
rmSync(staging, { recursive: true, force: true })
execFileSync('cp', ['-R', join(root, 'extension'), staging])
rmSync(join(staging, '.DS_Store'), { force: true })
execFileSync('zip', ['-rqX', zipName, 'grey-owls-tracker', '-x', '*.DS_Store'], { cwd: outDir })
rmSync(staging, { recursive: true, force: true })

// The site's copy keeps one name, so the download link never changes.
const publicZip = join(root, 'public', 'downloads', 'grey-owls-tracker-extension.zip')
mkdirSync(join(root, 'public', 'downloads'), { recursive: true })
copyFileSync(zipPath, publicZip)

console.log(`Packed v${version}: ${zipPath}`)
console.log(`Site download: ${publicZip}`)
