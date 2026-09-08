import { describe, it, expect } from 'vitest'
import { ministerioCalza } from '@/lib/ministerios'
import { capabilitiesForProfile, can } from '@/lib/permissions'
import { isRegionRestricted, type UserProfile } from '@/lib/apiAuth'

/**
 * Rol SEREMI (mig 087): ve SOLO su región × su ministerio y solo puede aportar
 * avance. Estos casos blindan las dos piezas frágiles: el matcheo de ministerio
 * contra un campo TEXT multi-valor y sucio, y el preset de capacidades (que si
 * se ensancha por accidente le da poder de más a un usuario externo).
 */

describe('ministerioCalza — cartera de un SEREMI', () => {
  const MOP   = 'Ministerio de Obras Públicas'
  const MINVU = 'Ministerio de Vivienda y Urbanismo'

  it('calza el caso simple', () => {
    expect(ministerioCalza(MOP, 'Ministerio de Obras Públicas')).toBe(true)
  })

  it('calza aunque el dato esté sin tilde o abreviado (prod tiene 164 filas así)', () => {
    expect(ministerioCalza(MOP, 'Ministerio de Obras Publicas')).toBe(true)
    expect(ministerioCalza(MOP, 'Min. Obras Publicas')).toBe(true)
  })

  it('multi-ministerio: basta con estar entre ellos', () => {
    const multi = 'Ministerio de Vivienda y Urbanismo;Ministerio de Obras Públicas'
    expect(ministerioCalza(MOP, multi)).toBe(true)
    expect(ministerioCalza(MINVU, multi)).toBe(true)
  })

  it('no calza el ministerio ajeno', () => {
    expect(ministerioCalza(MOP, 'Ministerio de Salud')).toBe(false)
    expect(ministerioCalza(MOP, 'Ministerio de Vivienda y Urbanismo')).toBe(false)
  })

  it('fail-closed: SEREMI sin ministerio no ve nada', () => {
    expect(ministerioCalza(null, MOP)).toBe(false)
    expect(ministerioCalza('', MOP)).toBe(false)
    expect(ministerioCalza('   ', MOP)).toBe(false)
  })

  it('iniciativa sin ministerio no cae en la cartera de nadie', () => {
    expect(ministerioCalza(MOP, null)).toBe(false)
    expect(ministerioCalza(MOP, '')).toBe(false)
  })

  it('"Sin asignar" / basura NO actúa de comodín', () => {
    // normalizeMinisterio manda null/''/'Pendiente' a 'Sin asignar'; eso no debe
    // convertirse en un match universal.
    expect(ministerioCalza('Sin asignar', 'Pendiente')).toBe(false)
    expect(ministerioCalza('Pendiente', 'Pendiente')).toBe(false)
  })

  it('el nombre histórico combinado no es cartera de NADIE (mal categorizadas)', () => {
    // 519 filas en prod. normalizeMinisterio lo colapsa a 'Ministerio del
    // Interior' para el filtro del Dashboard, pero acá debe quedar fuera — igual
    // que en current_user_sees_ministerio() de la BD.
    const combinado = 'Ministerio del Interior y Seguridad Pública'
    expect(ministerioCalza('Ministerio del Interior', combinado)).toBe(false)
    expect(ministerioCalza('Ministerio de Seguridad Pública', combinado)).toBe(false)
    expect(ministerioCalza(combinado, combinado)).toBe(false)
  })
})

describe('preset del rol seremi — no debe ensancharse por accidente', () => {
  const seremi = capabilitiesForProfile({ role: 'seremi', region_cods: ['VII'] })

  it('puede aportar avance en SU región', () => {
    expect(can(seremi, 'iniciativa.editar_avance', 'VII')).toBe(true)
    expect(can(seremi, 'iniciativa.seguimiento_crear')).toBe(true)
    expect(can(seremi, 'planificacion.ver', 'VII')).toBe(true)
    expect(can(seremi, 'planificacion.editar', 'VII')).toBe(true)
  })

  it('no puede aportar avance en otra región', () => {
    expect(can(seremi, 'iniciativa.editar_avance', 'VIII')).toBe(false)
    expect(can(seremi, 'planificacion.editar', 'VIII')).toBe(false)
  })

  it('NO tiene lo operativo completo ni nada definicional', () => {
    expect(can(seremi, 'iniciativa.editar_operativo', 'VII')).toBe(false)  // responsable/etapa/hito
    expect(can(seremi, 'iniciativa.editar_definicional', 'VII')).toBe(false)
    expect(can(seremi, 'iniciativa.editar_capa', 'VII')).toBe(false)
    expect(can(seremi, 'iniciativa.eliminar', 'VII')).toBe(false)
    expect(can(seremi, 'iniciativa.marcar_foco', 'VII')).toBe(false)
    expect(can(seremi, 'iniciativa.gestionar_ajeno', 'VII')).toBe(false)
  })

  it('NO ve comités, gabinete, desalojos, PREGO ni permisos', () => {
    expect(can(seremi, 'comite.policial.operar', 'VII')).toBe(false)
    expect(can(seremi, 'comite.economico.operar', 'VII')).toBe(false)
    expect(can(seremi, 'comite.gabinete.operar', 'VII')).toBe(false)
    expect(can(seremi, 'comite.gabinete.preparar', 'VII')).toBe(false)
    expect(can(seremi, 'sec.desalojos')).toBe(false)
    expect(can(seremi, 'sec.prego')).toBe(false)
    expect(can(seremi, 'sec.permisos')).toBe(false)
    expect(can(seremi, 'usuarios.gestionar')).toBe(false)
    expect(can(seremi, 'dashboard.importar')).toBe(false)
    expect(can(seremi, 'region.gestionar_ejes', 'VII')).toBe(false)
    expect(can(seremi, 'metrica.definir', 'VII')).toBe(false)
  })

  it('ve las secciones que sí le tocan', () => {
    expect(can(seremi, 'sec.mapa')).toBe(true)
    expect(can(seremi, 'sec.dashboard')).toBe(true)
    expect(can(seremi, 'sec.mi_region')).toBe(true)
  })

  it('un seremi sin región no queda con caps scopeadas', () => {
    const sinRegion = capabilitiesForProfile({ role: 'seremi', region_cods: [] })
    expect(can(sinRegion, 'iniciativa.editar_avance', 'VII')).toBe(false)
    expect(can(sinRegion, 'sec.mi_region')).toBe(true)
  })
})

/**
 * `isRegionRestricted` es el chequeo de alcance de las rutas que generan
 * artefactos con service-role (cartera PDF, minuta, cronograma) — bypassan la
 * RLS, así que si un rol se queda fuera de acá se lleva la data de otra región.
 * El seremi quedó fuera al crearse el rol; este caso lo fija.
 */
describe('isRegionRestricted — alcance de las rutas con service-role', () => {
  const perfil = (role: UserProfile['role'], region_cods: string[]): UserProfile => ({
    id: 'u', email: 'u@x.cl', full_name: null, role, region_cods,
    ministerio: null, debe_cambiar_clave: false, created_at: null,
  })

  it('acota a regional, seremi y viewer con regiones', () => {
    expect(isRegionRestricted(perfil('regional', ['VII']))).toBe(true)
    expect(isRegionRestricted(perfil('seremi',   ['VII']))).toBe(true)
    expect(isRegionRestricted(perfil('viewer',   ['VII']))).toBe(true)
  })

  it('no acota a admin, editor ni viewer nacional', () => {
    expect(isRegionRestricted(perfil('admin',  []))).toBe(false)
    expect(isRegionRestricted(perfil('editor', []))).toBe(false)
    expect(isRegionRestricted(perfil('viewer', []))).toBe(false)
  })
})
