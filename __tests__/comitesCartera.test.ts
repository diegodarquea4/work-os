import { describe, it, expect } from 'vitest'
import {
  aplicarEtiqueta,
  etiquetaCanonica,
  etiquetasGestionables,
  puedeGestionarCartera,
  TAG_INFRAESTRUCTURA_DEFAULT,
} from '@/lib/comitesCartera'

/**
 * Estas funciones NO son filtros de UI: son la autorización real de
 * /api/comites/cartera, que escribe con service role y por lo
 * tanto no pasa ni por la RLS (mig 087) ni por el trigger de columnas
 * (mig 028). Lo que se cuele acá llega a la columna `tags`.
 */

const MOP = 'Ministerio de Obras Públicas'
const ECONOMIA = 'Ministerio de Economía, Fomento y Turismo'

describe('puedeGestionarCartera', () => {
  // La delegación arma la cartera: no está acotada por ministerio en ningún
  // lado del sistema (su `ministerio` es NULL y current_user_sees_ministerio
  // le devuelve todo).
  it('la delegación puede con cualquier iniciativa', () => {
    for (const rol of ['admin', 'editor', 'regional']) {
      expect(puedeGestionarCartera('infraestructura', rol, null, MOP)).toBe(true)
      expect(puedeGestionarCartera('infraestructura', rol, null, 'Ministerio de Vivienda y Urbanismo')).toBe(true)
      expect(puedeGestionarCartera('infraestructura', rol, null, null)).toBe(true)
    }
  })

  it('un SEREMI puede con las de su propio ministerio', () => {
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, MOP)).toBe(true)
  })

  // El caso que hace falta tapar: el service role se salta la RLS, así que sin
  // este corte un SEREMI podría mandar el id de una iniciativa que no tiene
  // permitido ni leer y etiquetarla igual.
  it('un SEREMI NO puede con las de otro ministerio', () => {
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, 'Ministerio de Vivienda y Urbanismo')).toBe(false)
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, 'Ministerio de Salud')).toBe(false)
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, null)).toBe(false)
  })

  // `ministerio` es multi-valor con ';' — el SEREMI de MOP alcanza una
  // iniciativa compartida con Vivienda.
  it('un SEREMI alcanza las iniciativas compartidas entre ministerios', () => {
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, `Ministerio de Vivienda y Urbanismo;${MOP}`)).toBe(true)
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, `${MOP};Ministerio de Transportes y Telecomunicaciones`)).toBe(true)
  })

  // Fail-closed ante el dato faltante: se recupera completando el perfil.
  it('un SEREMI sin ministerio declarado no puede con nada', () => {
    expect(puedeGestionarCartera('infraestructura', 'seremi', null, MOP)).toBe(false)
    expect(puedeGestionarCartera('infraestructura', 'seremi', '', MOP)).toBe(false)
    expect(puedeGestionarCartera('infraestructura', 'seremi', '   ', MOP)).toBe(false)
  })

  it('reconoce las variantes con que se escribe el ministerio', () => {
    for (const variante of ['Ministerio de Obras Publicas', 'Min. Obras Públicas', `  ${MOP}  `]) {
      expect(puedeGestionarCartera('infraestructura', 'seremi', variante, MOP)).toBe(true)
      expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, variante)).toBe(true)
    }
  })

  // ── El Económico corta distinto ────────────────────────────────────────────
  // Allá "quién entra y quién sale de la cartera lo decide quien conduce"
  // (mig 112). No es el ministerio de la INICIATIVA lo que manda, como en
  // Infraestructura, sino el del USUARIO: un SEREMI sectorial aporta sobre lo
  // que ya está adentro, pero no compone la cartera.

  it('en el Económico conduce la delegación, con cualquier iniciativa', () => {
    for (const rol of ['admin', 'editor', 'regional']) {
      expect(puedeGestionarCartera('economico', rol, null, MOP)).toBe(true)
      expect(puedeGestionarCartera('economico', rol, null, ECONOMIA)).toBe(true)
      expect(puedeGestionarCartera('economico', rol, null, null)).toBe(true)
    }
  })

  it('en el Económico el SEREMI de Economía compone la cartera', () => {
    expect(puedeGestionarCartera('economico', 'seremi', ECONOMIA, MOP)).toBe(true)
    expect(puedeGestionarCartera('economico', 'seremi', ECONOMIA, null)).toBe(true)
  })

  // La diferencia que importa entre los dos comités: acá el SEREMI de MOP NO
  // puede, ni siquiera con una iniciativa de su propio ministerio.
  it('en el Económico un SEREMI sectorial no compone la cartera, ni la suya', () => {
    expect(puedeGestionarCartera('economico', 'seremi', MOP, MOP)).toBe(false)
    expect(puedeGestionarCartera('economico', 'seremi', MOP, ECONOMIA)).toBe(false)
    // …mientras que en Infraestructura esa misma persona sí puede con la suya.
    expect(puedeGestionarCartera('infraestructura', 'seremi', MOP, MOP)).toBe(true)
  })

  it('en el Económico un SEREMI sin ministerio declarado no puede', () => {
    expect(puedeGestionarCartera('economico', 'seremi', null, MOP)).toBe(false)
    expect(puedeGestionarCartera('economico', 'seremi', '', MOP)).toBe(false)
  })
})

describe('etiquetasGestionables', () => {
  it('incluye la etiqueta del comité y sus megaproyectos', () => {
    expect(etiquetasGestionables('CRI', ['Carretera Austral', 'Aeropuerto Tepual']))
      .toEqual(['CRI', 'Carretera Austral', 'Aeropuerto Tepual'])
  })

  it('cae al default solo si la región no tiene tag configurado', () => {
    expect(etiquetasGestionables(null, null)).toEqual([TAG_INFRAESTRUCTURA_DEFAULT])
    expect(etiquetasGestionables('   ', [])).toEqual([TAG_INFRAESTRUCTURA_DEFAULT])
  })

  // Una región puede tener el suyo: el tag sale de region_config, no del código.
  it('respeta un tag propio de la región', () => {
    expect(etiquetasGestionables('CIR', [])).toEqual(['CIR'])
  })

  it('no repite si un megaproyecto se llama igual que el tag del comité', () => {
    expect(etiquetasGestionables('CRI', ['cri', 'Carretera Austral']))
      .toEqual(['CRI', 'Carretera Austral'])
  })
})

describe('etiquetaCanonica', () => {
  const gestionables = etiquetasGestionables('CRI', ['Carretera Austral'])

  it('devuelve la forma de region_config, no la que mandó el cliente', () => {
    expect(etiquetaCanonica('cri', gestionables)).toBe('CRI')
    expect(etiquetaCanonica('  CRI  ', gestionables)).toBe('CRI')
    expect(etiquetaCanonica('carretera austral', gestionables)).toBe('Carretera Austral')
  })

  // La ruta no es un editor genérico de `tags`: lo que no está en la lista
  // blanca no se toca, aunque quien llame tenga la capacidad del comité.
  it('rechaza cualquier etiqueta ajena al comité', () => {
    expect(etiquetaCanonica('CER', gestionables)).toBeNull()
    expect(etiquetaCanonica('Desalojo', gestionables)).toBeNull()
    expect(etiquetaCanonica('', gestionables)).toBeNull()
    expect(etiquetaCanonica(null, gestionables)).toBeNull()
  })
})

describe('aplicarEtiqueta', () => {
  it('suma la etiqueta al final y deja el resto intacto', () => {
    expect(aplicarEtiqueta(['Carretera Austral', 'Puente'], 'CRI', 'sumar'))
      .toEqual(['Carretera Austral', 'Puente', 'CRI'])
  })

  it('parte de cero cuando la iniciativa no tiene etiquetas', () => {
    expect(aplicarEtiqueta(null, 'CRI', 'sumar')).toEqual(['CRI'])
    expect(aplicarEtiqueta([], 'CRI', 'sumar')).toEqual(['CRI'])
  })

  it('quita la etiqueta y deja el resto intacto', () => {
    expect(aplicarEtiqueta(['Carretera Austral', 'CRI', 'Puente'], 'CRI', 'quitar'))
      .toEqual(['Carretera Austral', 'Puente'])
  })

  // Misma referencia = nada que escribir. La ruta lo usa para saltarse el UPDATE.
  it('devuelve la misma referencia cuando no hay nada que cambiar', () => {
    const yaLaTiene = ['CRI', 'Puente']
    expect(aplicarEtiqueta(yaLaTiene, 'CRI', 'sumar')).toBe(yaLaTiene)

    const noLaTiene = ['Puente']
    expect(aplicarEtiqueta(noLaTiene, 'CRI', 'quitar')).toBe(noLaTiene)
  })

  // El resto del módulo compara con `tags.includes(tag)` — comparación exacta.
  // Una iniciativa con 'cri' quedaría fuera del comité "teniendo la etiqueta",
  // así que sumar normaliza la variante en vez de dejar las dos conviviendo.
  it('sumar deja la forma canónica y borra las variantes de mayúsculas', () => {
    expect(aplicarEtiqueta(['cri', 'Puente'], 'CRI', 'sumar')).toEqual(['Puente', 'CRI'])
    expect(aplicarEtiqueta(['CRI', 'cri'], 'CRI', 'sumar')).toEqual(['CRI'])
  })

  it('quitar saca todas las variantes', () => {
    expect(aplicarEtiqueta(['cri', 'CRI', 'Puente'], 'CRI', 'quitar')).toEqual(['Puente'])
  })

  it('no toca etiquetas que apenas se parecen', () => {
    const tags = ['CRI-2', 'CRIA', 'CER']
    expect(aplicarEtiqueta(tags, 'CRI', 'quitar')).toBe(tags)
  })

  // Poner y sacar tiene que dejar la lista como estaba: es lo que hace el plan
  // de prueba de saldo cero contra la base de producción.
  it('sumar y después quitar deja las etiquetas originales', () => {
    const original = ['Carretera Austral', 'Puente']
    const conTag = aplicarEtiqueta(original, 'CRI', 'sumar')
    expect(aplicarEtiqueta(conTag, 'CRI', 'quitar')).toEqual(original)
  })
})
