/**
 * Normalización de rutas de Supabase Storage.
 *
 * Contexto: los buckets `plan-regional` y `project-docs` eran públicos y en la
 * BD se guardaba la URL pública completa. Al privatizarlos (mig 089) se pasa a
 * guardar el PATH y firmar el link al servirlo. Estos helpers dejan que el
 * despliegue del código y la migración puedan ir en cualquier orden: mientras
 * convivan ambos formatos, el link sigue funcionando.
 */

/** ¿El valor guardado es una URL absoluta (fila legacy) y no un path? */
export function esUrlAbsoluta(valor: string): boolean {
  return /^https?:\/\//i.test(valor)
}

/**
 * Path dentro del bucket a partir de lo que haya en la BD.
 *
 *   'XIV.pdf'                                          → 'XIV.pdf'
 *   'https://x.supabase.co/…/public/plan-regional/XIV.pdf' → 'XIV.pdf'
 *
 * Solo aplica a buckets de un nivel (`plan-regional`, donde el path es
 * `<COD>.pdf`). Para paths con carpetas usar `esUrlAbsoluta` y decidir aparte.
 */
export function planPath(archivoUrl: string): string {
  return archivoUrl.replace(/^.*\//, '')
}
