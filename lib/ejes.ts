/**
 * Ejes regionales — fuente única de verdad para formato display y parsing.
 *
 * Storage: `region_ejes.nombre` guarda solo el nombre puro (ej. "Salud y
 * Servicios Básicos"). El prefijo "Eje N:" NO se persiste — se compone en
 * UI con `composeEjeLabel()`. Esto desacopla el formato del dato y permite
 * cambiar el display (ej. "EJE N —") sin migración de BD.
 *
 * Si en algún momento cambia el formato canónico (colon → em dash, etc.),
 * tocá solo este archivo.
 */

/** Compone el label legible "Eje N: Nombre" desde los campos del catálogo. */
export function composeEjeLabel(numero: number, nombre: string): string {
  return `Eje ${numero}: ${nombre}`
}

/**
 * Parsea un string de eje en `{ numero, nombre }`. Tolerante a:
 *   - Case-insensitive: "Eje", "EJE", "eje"
 *   - Separadores: ":", "—" (em dash), "–" (en dash), "-" (hyphen), o nada
 *   - Whitespace variable alrededor
 *
 * Retorna null si el string no tiene un número parseable o si el nombre
 * resultante queda vacío. El parser es el espejo de la regex usada en la
 * migración SQL 015 para mantener consistencia entre cliente y backfill.
 */
export function parseEjeString(raw: string): { numero: number; nombre: string } | null {
  const m = raw.match(/^\s*eje\s+(\d+)\s*[:—–\-]?\s*(.*)$/i)
  if (!m) return null
  const numero = parseInt(m[1], 10)
  const nombre = m[2].trim()
  if (!numero || !nombre) return null
  return { numero, nombre }
}
