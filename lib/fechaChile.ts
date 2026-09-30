/**
 * El día calendario en Chile, para el servidor.
 *
 * ── Por qué no alcanza `new Date().toISOString().slice(0, 10)` ──────────────
 *
 * Vercel corre en UTC. A las 21:30 de un martes en Santiago allá ya es
 * miércoles, así que «se actualizó hoy» daría false y el candado diario se
 * abriría seis horas antes de medianoche. Al revés pasa lo mismo: de 00:00 a
 * 04:00 chilenas, UTC sigue en el día anterior.
 *
 * ── Por qué no se fija el desfase en −3 o −4 ────────────────────────────────
 *
 * Chile cambia de hora dos veces al año (−03 en verano, −04 en invierno) y
 * Magallanes no cambia nunca. Un número fijo corre el día cuatro horas la mitad
 * del año, que es exactamente el error que esto viene a evitar. El desfase se
 * le pregunta a `Intl` para la fecha que se está mirando.
 *
 * Se usa la hora de Santiago para todo el país: es la del continente y la del
 * horario de oficina que fija los plazos de los oficios.
 */

const TZ = 'America/Santiago'

/** Minutos de diferencia entre la hora de pared en Chile y UTC (−240 o −180). */
function desfaseMin(d: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)
  const n = (tipo: string) => Number(partes.find(p => p.type === tipo)!.value)
  // `hour12: false` devuelve «24» para la medianoche en algunos runtimes.
  const pared = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'))
  // El instante se trunca al segundo porque `pared` no tiene milisegundos.
  return Math.round((pared - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
}

/** `'2026-09-30'` — el día que es en Chile en ese instante. */
export function diaChile(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** El instante en que empezó ese día en Chile (00:00 hora de Santiago). */
export function inicioDelDiaChile(d: Date = new Date()): Date {
  const medianocheComoSiFueraUTC = Date.parse(`${diaChile(d)}T00:00:00Z`)
  return new Date(medianocheComoSiFueraUTC - desfaseMin(d) * 60_000)
}

/** `true` si ese timestamp cae en el mismo día chileno que `ahora`. */
export function esDeHoyEnChile(iso: string | null | undefined, ahora: Date = new Date()): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return diaChile(new Date(t)) === diaChile(ahora)
}
