/**
 * Color pastel determinístico por etiqueta — mismo texto siempre cae en el
 * mismo color (hash simple del string, sin estado ni catálogo que mantener).
 * Clases completas y literales (no interpoladas) para que Tailwind las
 * detecte en el scan de contenido.
 */

const PALETTE: readonly { bg: string; text: string }[] = [
  { bg: 'bg-pink-100',   text: 'text-pink-700' },
  { bg: 'bg-blue-100',   text: 'text-blue-700' },
  { bg: 'bg-green-100',  text: 'text-green-700' },
  { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-teal-100',   text: 'text-teal-700' },
  { bg: 'bg-rose-100',   text: 'text-rose-700' },
  { bg: 'bg-cyan-100',   text: 'text-cyan-700' },
  { bg: 'bg-lime-100',   text: 'text-lime-800' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-amber-100',  text: 'text-amber-800' },
]

/** djb2 — simple, rápido, suficientemente bien distribuido para esto. */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

export function tagColor(tag: string): { bg: string; text: string } {
  return PALETTE[hashString(tag) % PALETTE.length]
}
