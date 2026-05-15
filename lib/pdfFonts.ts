/**
 * PDF Font registration for @react-pdf/renderer.
 *
 * Uses Carlito (open-source, metric-compatible with Calibri).
 * Import this module once before rendering any PDF that uses fontFamily: 'Carlito'.
 *
 * Note: react-pdf requires local .ttf files, not remote URLs or CSS @import.
 * The files live in /public/fonts/carlito/.
 */

import { Font } from '@react-pdf/renderer'
import { join } from 'path'

let registered = false

export function registerPdfFonts() {
  if (registered) return
  registered = true

  const base = join(process.cwd(), 'public', 'fonts', 'carlito')

  Font.register({
    family: 'Carlito',
    fonts: [
      { src: join(base, 'Carlito-Regular.ttf') },
      { src: join(base, 'Carlito-Bold.ttf'), fontWeight: 'bold' },
      { src: join(base, 'Carlito-Italic.ttf'), fontStyle: 'italic' },
      { src: join(base, 'Carlito-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })

  // Disable hyphenation (react-pdf default hyphenation breaks Spanish words badly)
  Font.registerHyphenationCallback(word => [word])
}
