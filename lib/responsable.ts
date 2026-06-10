/**
 * Helper de display para el campo `responsable` (string libre, hoy email).
 *
 * Mientras no haya una migración que separe `responsable_email` de
 * `responsable_nombre`, lo único que podemos hacer en UI es mostrar la parte
 * legible del email. Esta función vive aparte para no inventar la misma regla
 * en cada componente.
 */
export function formatResponsableDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const at = trimmed.indexOf('@')
  return at > 0 ? trimmed.slice(0, at) : trimmed
}
