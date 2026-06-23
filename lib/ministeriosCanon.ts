/**
 * Canonización de nombres de ministerios para la carga masiva.
 *
 * Problema: el catálogo histórico de `prioridades_territoriales.ministerio`
 * está fragmentado. Aparecen siglas ("MINVU"), variantes sin tilde
 * ("Ministerio de Obras Publicas"), nombres parciales ("Ministerio del
 * Interior" vs "Ministerio del Interior y Seguridad Pública"), etc.
 *
 * Política: en el parser, cuando el delegado escribe cualquiera de las
 * formas conocidas, lo persistimos como nombre oficial canónico. Las
 * formas no reconocidas pasan tal cual (texto libre — el sistema sigue
 * sin catálogo cerrado).
 *
 * El matching es por slug normalizado: lowercase, sin tildes, trim, espacios
 * colapsados. Eso absorbe "MINVU" / "minvu" / " Minvu " a la misma entrada.
 *
 * Convenciones del catálogo canónico (junio 2026):
 *   - Nombres OFICIALES completos con tildes.
 *   - "Ministerio del Interior" y "Ministerio de Seguridad Pública" se mantienen
 *     SEPARADOS (reestructura 2023). El nombre histórico
 *     "Ministerio del Interior y Seguridad Pública" tiene su propia entrada,
 *     no se descompone en dos.
 *   - SUBDERE es una subsecretaría, pero su sigla es el nombre canónico de uso.
 */

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// Lista oficial de canónicos — todos los `value` válidos del diccionario.
// Exportada para que la UI pueda mostrar el listado si lo necesitase
// (autocompletes, hoja Excel opcional, etc.).
export const MINISTERIOS_CANONICOS = [
  'Ministerio de Vivienda y Urbanismo',
  'Ministerio de Obras Públicas',
  'Ministerio de Educación',
  'Ministerio de Salud',
  'Ministerio de Transportes y Telecomunicaciones',
  'Ministerio de Desarrollo Social y Familia',
  'Ministerio de Economía, Fomento y Turismo',
  'Ministerio de Agricultura',
  'Ministerio de Energía',
  'Ministerio de Justicia y Derechos Humanos',
  'Ministerio de las Culturas, las Artes y el Patrimonio',
  'Ministerio del Deporte',
  'Ministerio del Trabajo y Previsión Social',
  'Ministerio de la Mujer y la Equidad de Género',
  'Ministerio del Medio Ambiente',
  'Ministerio de Defensa Nacional',
  'Ministerio de Relaciones Exteriores',
  'Ministerio de Hacienda',
  'Ministerio de Bienes Nacionales',
  'Ministerio de Minería',
  'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'Ministerio Secretaría General de la Presidencia',
  'Ministerio Secretaría General de Gobierno',
  'Ministerio del Interior',
  'Ministerio del Interior y Seguridad Pública',
  'Ministerio de Seguridad Pública',
  'SUBDERE',
] as const

export type MinisterioCanonico = typeof MINISTERIOS_CANONICOS[number]

// Mapa alias slug → canónico. Si agregás un alias acordate de slugificarlo
// mentalmente: sin tildes, lowercase, espacios simples.
const ALIASES: Record<string, MinisterioCanonico> = {
  // ── Vivienda ────────────────────────────────────────────────────────
  'minvu':                                  'Ministerio de Vivienda y Urbanismo',
  'ministerio de vivienda':                 'Ministerio de Vivienda y Urbanismo',
  'ministerio de vivienda y urbanismo':     'Ministerio de Vivienda y Urbanismo',
  // ── Obras Públicas ──────────────────────────────────────────────────
  'mop':                                    'Ministerio de Obras Públicas',
  'min mop':                                'Ministerio de Obras Públicas',
  'ministerio de obras publicas':           'Ministerio de Obras Públicas',
  // ── Educación ───────────────────────────────────────────────────────
  'mineduc':                                'Ministerio de Educación',
  'min educacion':                          'Ministerio de Educación',
  'ministerio de educacion':                'Ministerio de Educación',
  // ── Salud ───────────────────────────────────────────────────────────
  'minsal':                                 'Ministerio de Salud',
  'ministerio de salud':                    'Ministerio de Salud',
  // ── Transportes ─────────────────────────────────────────────────────
  'mtt':                                    'Ministerio de Transportes y Telecomunicaciones',
  'ministerio de transportes':              'Ministerio de Transportes y Telecomunicaciones',
  'ministerio de transportes y telecomunicaciones': 'Ministerio de Transportes y Telecomunicaciones',
  // ── Desarrollo Social y Familia ─────────────────────────────────────
  'mds':                                    'Ministerio de Desarrollo Social y Familia',
  'mdsf':                                   'Ministerio de Desarrollo Social y Familia',
  'mideso':                                 'Ministerio de Desarrollo Social y Familia',
  'ministerio de desarrollo social':        'Ministerio de Desarrollo Social y Familia',
  'ministerio de desarrollo social y familia': 'Ministerio de Desarrollo Social y Familia',
  // ── Economía ────────────────────────────────────────────────────────
  'mineconomia':                            'Ministerio de Economía, Fomento y Turismo',
  'min economia':                           'Ministerio de Economía, Fomento y Turismo',
  'ministerio de economia':                 'Ministerio de Economía, Fomento y Turismo',
  'ministerio de economia, fomento y turismo': 'Ministerio de Economía, Fomento y Turismo',
  // ── Agricultura ─────────────────────────────────────────────────────
  'minagri':                                'Ministerio de Agricultura',
  'ministerio de agricultura':              'Ministerio de Agricultura',
  // ── Energía ─────────────────────────────────────────────────────────
  'minenergia':                             'Ministerio de Energía',
  'ministerio de energia':                  'Ministerio de Energía',
  // ── Justicia ────────────────────────────────────────────────────────
  'minju':                                  'Ministerio de Justicia y Derechos Humanos',
  'minjusticia':                            'Ministerio de Justicia y Derechos Humanos',
  'ministerio de justicia':                 'Ministerio de Justicia y Derechos Humanos',
  'ministerio de justicia y derechos humanos': 'Ministerio de Justicia y Derechos Humanos',
  // ── Culturas ────────────────────────────────────────────────────────
  'mincap':                                 'Ministerio de las Culturas, las Artes y el Patrimonio',
  'mincultura':                             'Ministerio de las Culturas, las Artes y el Patrimonio',
  'minculturas':                            'Ministerio de las Culturas, las Artes y el Patrimonio',
  'ministerio de cultura':                  'Ministerio de las Culturas, las Artes y el Patrimonio',
  'ministerio de las culturas':             'Ministerio de las Culturas, las Artes y el Patrimonio',
  'ministerio de las culturas, las artes y el patrimonio': 'Ministerio de las Culturas, las Artes y el Patrimonio',
  // ── Deporte ─────────────────────────────────────────────────────────
  'mindep':                                 'Ministerio del Deporte',
  'min deporte':                            'Ministerio del Deporte',
  'ministerio del deporte':                 'Ministerio del Deporte',
  // ── Trabajo ─────────────────────────────────────────────────────────
  'mintrab':                                'Ministerio del Trabajo y Previsión Social',
  'mintrabajo':                             'Ministerio del Trabajo y Previsión Social',
  'ministerio del trabajo':                 'Ministerio del Trabajo y Previsión Social',
  'ministerio del trabajo y prevision social': 'Ministerio del Trabajo y Previsión Social',
  // ── Mujer ───────────────────────────────────────────────────────────
  'minmujer':                               'Ministerio de la Mujer y la Equidad de Género',
  'ministerio de la mujer':                 'Ministerio de la Mujer y la Equidad de Género',
  'ministerio de la mujer y la equidad de genero': 'Ministerio de la Mujer y la Equidad de Género',
  // ── Medio Ambiente ──────────────────────────────────────────────────
  'mma':                                    'Ministerio del Medio Ambiente',
  'minambiente':                            'Ministerio del Medio Ambiente',
  'ministerio del medio ambiente':          'Ministerio del Medio Ambiente',
  // ── Defensa ─────────────────────────────────────────────────────────
  'mindef':                                 'Ministerio de Defensa Nacional',
  'mindefensa':                             'Ministerio de Defensa Nacional',
  'ministerio de defensa':                  'Ministerio de Defensa Nacional',
  'ministerio de defensa nacional':         'Ministerio de Defensa Nacional',
  // ── Relaciones Exteriores ───────────────────────────────────────────
  'minrel':                                 'Ministerio de Relaciones Exteriores',
  'minrelex':                               'Ministerio de Relaciones Exteriores',
  'rree':                                   'Ministerio de Relaciones Exteriores',
  'cancilleria':                            'Ministerio de Relaciones Exteriores',
  'ministerio de relaciones exteriores':    'Ministerio de Relaciones Exteriores',
  // ── Hacienda ────────────────────────────────────────────────────────
  'minhacienda':                            'Ministerio de Hacienda',
  'ministerio de hacienda':                 'Ministerio de Hacienda',
  // ── Bienes Nacionales ───────────────────────────────────────────────
  'mbn':                                    'Ministerio de Bienes Nacionales',
  'bbnn':                                   'Ministerio de Bienes Nacionales',
  'minbienes':                              'Ministerio de Bienes Nacionales',
  'ministerio de bienes nacionales':        'Ministerio de Bienes Nacionales',
  // ── Minería ─────────────────────────────────────────────────────────
  'minmineria':                             'Ministerio de Minería',
  'ministerio de mineria':                  'Ministerio de Minería',
  // ── Ciencia ─────────────────────────────────────────────────────────
  'minciencia':                             'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'mincyt':                                 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'ministerio de ciencia':                  'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'ministerio de ciencia, tecnologia, conocimiento e innovacion': 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  // ── Segpres ─────────────────────────────────────────────────────────
  'segpres':                                'Ministerio Secretaría General de la Presidencia',
  'ministerio secretaria general de la presidencia': 'Ministerio Secretaría General de la Presidencia',
  // ── Segegob ─────────────────────────────────────────────────────────
  'segegob':                                'Ministerio Secretaría General de Gobierno',
  'ministerio secretaria general de gobierno': 'Ministerio Secretaría General de Gobierno',
  // ── Interior (separado de Seguridad post-2023) ──────────────────────
  'mininterior':                            'Ministerio del Interior',
  'ministerio del interior':                'Ministerio del Interior',
  // Nombre histórico pre-reestructura. Lo mantenemos como su propia entrada
  // porque data vieja lo refiere así; nuevos registros deberían usar los
  // dos canónicos por separado ("Ministerio del Interior;Ministerio de
  // Seguridad Pública") si refieren al esquema actual.
  'ministerio del interior y seguridad publica': 'Ministerio del Interior y Seguridad Pública',
  // ── Seguridad Pública ──────────────────────────────────────────────
  'minseguridad':                           'Ministerio de Seguridad Pública',
  'min seguridad':                          'Ministerio de Seguridad Pública',
  'ministerio de seguridad':                'Ministerio de Seguridad Pública',
  'ministerio de seguridad publica':        'Ministerio de Seguridad Pública',
  // Variante histórica del actual Min. Seguridad Pública.
  'ministerio de seguridad y orden publico': 'Ministerio de Seguridad Pública',
  // ── SUBDERE ─────────────────────────────────────────────────────────
  'subdere':                                'SUBDERE',
  'subsecretaria de desarrollo regional':   'SUBDERE',
  'subsecretaria de desarrollo regional y administrativo': 'SUBDERE',
}

/**
 * Resuelve un nombre/sigla a su canónico oficial. Si no hay match, devuelve
 * el input tal cual (trimmed, espacios colapsados — pero conservando tildes
 * y casing originales).
 */
export function canonizeMinisterio(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ')
  if (!trimmed) return trimmed
  const slug = slugify(trimmed)
  return ALIASES[slug] ?? trimmed
}
