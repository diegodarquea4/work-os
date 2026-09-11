import { describe, it, expect } from 'vitest'
import { conduceComiteEconomico, MINISTERIO_CONDUCTOR_ECONOMICO } from '@/lib/comiteEconomico'
import { LISTA_CANONICA } from '@/lib/ministerios'

/**
 * Espejo en TypeScript de `es_seremi_ajeno_al_economico()` (mig 110). Acá se
 * decide qué se MUESTRA; la autorización real la hace la RLS. Si los dos se
 * separan, la UI ofrece algo que la base después rechaza — por eso estos casos.
 */
describe('conduceComiteEconomico', () => {
  it('el SEREMI de Economía conduce', () => {
    expect(conduceComiteEconomico('seremi', MINISTERIO_CONDUCTOR_ECONOMICO)).toBe(true)
  })

  // El caso que motivó todo esto: el SEREMI sectorial entra al comité a aportar
  // en la cartera, pero no abre ni cierra sesiones.
  it('un SEREMI de otro ministerio no conduce', () => {
    expect(conduceComiteEconomico('seremi', 'Ministerio de Obras Públicas')).toBe(false)
    expect(conduceComiteEconomico('seremi', 'Ministerio de Vivienda y Urbanismo')).toBe(false)
    expect(conduceComiteEconomico('seremi', 'Ministerio de Energía')).toBe(false)
  })

  // La delegación lleva el comité: los otros roles conducen sin mirar
  // ministerio. El gate de capacidad es aparte y va antes.
  it('los roles de la delegación conducen siempre', () => {
    for (const rol of ['admin', 'editor', 'regional', 'viewer']) {
      expect(conduceComiteEconomico(rol, null)).toBe(true)
      expect(conduceComiteEconomico(rol, 'Ministerio de Obras Públicas')).toBe(true)
    }
  })

  // Ante el dato faltante se elige el permiso menor: se recupera pidiendo que
  // completen el perfil, a diferencia de dejar abrir sesiones por accidente.
  it('un SEREMI sin ministerio declarado no conduce', () => {
    expect(conduceComiteEconomico('seremi', null)).toBe(false)
    expect(conduceComiteEconomico('seremi', undefined)).toBe(false)
    expect(conduceComiteEconomico('seremi', '')).toBe(false)
    expect(conduceComiteEconomico('seremi', '   ')).toBe(false)
  })

  // El ministerio llega escrito de muchas formas en los perfiles reales; el
  // normalizador es el mismo que usa el resto del sistema.
  it('reconoce las variantes con que se escribe el ministerio', () => {
    for (const variante of [
      'Ministerio de Economía, Fomento y Turismo',
      'Ministerio Economia, Fomento y Turismo',
      'Min. Economía',
      '  Ministerio de Economía, Fomento y Turismo  ',
    ]) {
      expect(conduceComiteEconomico('seremi', variante)).toBe(true)
    }
  })

  // Guarda contra un rename del catálogo: si alguien cambia el nombre canónico
  // en LISTA_CANONICA y no acá, ningún SEREMI podría conducir y el comité se
  // quedaría sin quien abra sesión, en silencio.
  it('el ministerio conductor existe en el catálogo canónico', () => {
    expect(LISTA_CANONICA).toContain(MINISTERIO_CONDUCTOR_ECONOMICO)
  })

  // Solo uno conduce: si el normalizador colapsara dos ministerios distintos en
  // el mismo valor, media docena de SEREMI ganarían control de las sesiones.
  it('ningún otro ministerio del catálogo conduce', () => {
    const conductores = LISTA_CANONICA.filter(m => conduceComiteEconomico('seremi', m))
    expect(conductores).toEqual([MINISTERIO_CONDUCTOR_ECONOMICO])
  })
})
