import { diasHasta } from '@/lib/oficiosSeia'

/**
 * Los oficios pendientes, vistos desde QUIEN TIENE QUE RESPONDER.
 *
 * La pestaña de la ficha mira los oficios de un proyecto; acá se mira al
 * revés, porque la gestión de la sesión es al revés: quien debe responder es
 * un organismo del Estado, y la conversación es «la SEREMI de Medio Ambiente
 * le dice a la DGA: tenés estos 4 oficios pendientes de estos 2 proyectos».
 *
 * Todo esto es PURO. Lo usa la sesión para armar la lista y la importación
 * para cerrar los compromisos que se cumplieron solos.
 */

// ── La llave del organismo ───────────────────────────────────────────────────

export type OficioSeguimiento = {
  id: number
  oaeca_sea: string | null
  oaeca_nombre: string | null
  nombre_proyecto: string | null
  proyecto_privado_id: number | null
  fecha_limite: string | null
  estado: 'pendiente' | 'resuelto'
}

/**
 * El nombre del organismo tal como hay que mostrarlo.
 *
 * `oaeca_sea` primero porque trae la jurisdicción, y sin ella el nombre no
 * identifica a nadie: «CONAF» sirve de poco si no se sabe cuál de las quince.
 * Es el mismo criterio con que la importación arma su llave de reconciliación
 * (`oaecaDe` en lib/oficiosSeia.ts), y tiene que seguir siéndolo: si los dos
 * lados eligieran distinto, un compromiso perseguiría a un organismo que los
 * oficios llaman de otra forma.
 */
export function nombreOaeca(o: Pick<OficioSeguimiento, 'oaeca_sea' | 'oaeca_nombre'>): string {
  return o.oaeca_sea ?? o.oaeca_nombre ?? 'Organismo sin identificar'
}

/**
 * La llave con que se compara un organismo, acá y contra `oaeca_objetivo` de
 * un compromiso. La fuente no es consistente con mayúsculas ni espacios, y dos
 * filas que solo difieren en eso son el mismo organismo — el índice único de
 * la mig 120 normaliza igual, del lado de Postgres.
 */
export function claveOaeca(texto: string | null | undefined): string {
  return (texto ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

// ── Agrupar ──────────────────────────────────────────────────────────────────

export type ProyectoDelGrupo = {
  /** `null` = el proyecto no está en la cartera; no hay ficha que abrir. */
  proyectoId: number | null
  nombre: string
  oficios: number
}

export type GrupoOaeca = {
  clave: string
  nombre: string
  oficios: OficioSeguimiento[]
  vencidos: number
  porVencer: number
  proyectos: ProyectoDelGrupo[]
  /** Días hasta el plazo más urgente del grupo. Negativo = atrasado. */
  peorPlazo: number
}

/**
 * Agrupa los oficios PENDIENTES por organismo, con qué proyectos arrastra cada
 * uno. Los resueltos se ignoran: el grupo existe para decidir a quién
 * reclamarle hoy.
 *
 * Sale ordenado por lo más atrasado primero. Un grupo sin ningún plazo (todos
 * sus oficios sin fecha) queda al final: no se puede decir nada de él y no
 * debe desplazar a los que sí vencen.
 */
export function agruparPorOaeca(oficios: OficioSeguimiento[], hoyISO: string): GrupoOaeca[] {
  const porClave = new Map<string, GrupoOaeca>()

  for (const o of oficios) {
    if (o.estado !== 'pendiente') continue
    const nombre = nombreOaeca(o)
    const clave = claveOaeca(nombre)

    let g = porClave.get(clave)
    if (!g) {
      g = {
        clave,
        nombre,
        oficios: [],
        vencidos: 0,
        porVencer: 0,
        proyectos: [],
        peorPlazo: Number.POSITIVE_INFINITY,
      }
      porClave.set(clave, g)
    }

    g.oficios.push(o)
    const d = o.fecha_limite ? diasHasta(o.fecha_limite, hoyISO) : null
    if (d != null && d < 0) g.vencidos++
    else g.porVencer++
    if (d != null && d < g.peorPlazo) g.peorPlazo = d

    // Los proyectos del grupo, sin repetir. Se identifican por su id de
    // cartera cuando lo tienen, y por nombre cuando no: dos oficios de un
    // proyecto que nadie sumó igual tienen que contarse como uno.
    const claveProy = o.proyecto_privado_id != null
      ? `p${o.proyecto_privado_id}`
      : `n${claveOaeca(o.nombre_proyecto)}`
    const p = g.proyectos.find(x => (
      x.proyectoId != null ? `p${x.proyectoId}` === claveProy : `n${claveOaeca(x.nombre)}` === claveProy
    ))
    if (p) p.oficios++
    else g.proyectos.push({
      proyectoId: o.proyecto_privado_id,
      nombre: o.nombre_proyecto ?? 'Proyecto sin nombre',
      oficios: 1,
    })
  }

  return [...porClave.values()].sort((a, b) => a.peorPlazo - b.peorPlazo)
}

// ── Cerrar lo que se cumplió solo ────────────────────────────────────────────

export type CompromisoSeguimiento = {
  id: number
  oaeca_objetivo: string | null
  estado: 'pendiente' | 'en_curso' | 'cumplido'
}

/**
 * Qué compromisos de seguimiento se cumplieron sin que nadie los marcara.
 *
 * El objetivo del compromiso es que el organismo responda. Cuando no le queda
 * ningún oficio pendiente, eso ya pasó: cerrarlo a mano sería pedirle a
 * alguien que confirme algo que el archivo del SEIA ya dice. Se cierra solo y
 * el acta lo reporta.
 *
 * Al revés NO: un compromiso cumplido no se reabre porque llegue un oficio
 * nuevo. Ese oficio es una conversación nueva y merece su propio compromiso,
 * con su fecha y su responsable; reabrir el viejo borraría cuándo se cumplió.
 *
 * `pendientes` tiene que ser TODOS los oficios pendientes de la misma región
 * que los compromisos. Si llegara filtrado —por ejemplo solo los vencidos— se
 * cerrarían compromisos de organismos que todavía deben oficios por vencer.
 */
export function compromisosACerrar(
  compromisos: CompromisoSeguimiento[],
  pendientes: OficioSeguimiento[],
): number[] {
  const conDeuda = new Set<string>()
  for (const o of pendientes) {
    if (o.estado !== 'pendiente') continue
    conDeuda.add(claveOaeca(nombreOaeca(o)))
  }

  return compromisos
    .filter(c => c.estado !== 'cumplido'
      && c.oaeca_objetivo != null
      && !conDeuda.has(claveOaeca(c.oaeca_objetivo)))
    .map(c => c.id)
}

/**
 * La descripción con que nace un compromiso de seguimiento.
 *
 * Se arma sola y no la escribe nadie: el contenido es un hecho —cuántos
 * oficios, de cuántos proyectos— y escribirlo a mano solo abre la puerta a que
 * diga otra cosa que la lista de al lado. Queda fija: es lo que se acordó ese
 * día, y dentro de dos semanas los números van a ser otros.
 */
export function descripcionSeguimiento(g: GrupoOaeca): string {
  const n = g.oficios.length
  const p = g.proyectos.length
  const oficios = `${n} oficio${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'}`
  const proyectos = `${p} proyecto${p === 1 ? '' : 's'}`
  const atraso = g.vencidos > 0 ? ` (${g.vencidos} vencido${g.vencidos === 1 ? '' : 's'})` : ''
  return `Seguimiento a ${g.nombre}: ${oficios} de ${proyectos}${atraso}.`
}
