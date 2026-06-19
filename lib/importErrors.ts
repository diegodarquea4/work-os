/**
 * Clasificacion y resumen de errores de import.
 *
 * Antes el modal mostraba N lineas crudas tipo "#3789: Nombre requerido"
 * repetidas 373 veces. Para el usuario era invisible que el problema real
 * era UN header mal nombrado en el Excel — pensaba que tenia 373 problemas
 * distintos.
 *
 * Este helper:
 *   1. Detecta familias frecuentes (header faltante, dato obligatorio,
 *      RLS, region/eje invalido, etc.).
 *   2. Detecta patrones globales (todos los errores son del mismo tipo →
 *      casi seguro es header mal nombrado).
 *   3. Mapea mensajes tecnicos de Postgres a copy castellano accionable
 *      (42501, 23505, 23503, 22P02...).
 *   4. Devuelve un banner explicativo cuando aplica, y la lista cruda
 *      como fallback para errores que no calzan con ningun patron.
 */

export type ErrorFamily =
  | 'header-faltante'
  | 'dato-requerido'
  | 'valor-invalido'
  | 'region-invalida'
  | 'eje-invalido'
  | 'region-mismatch'
  | 'permiso-denegado'
  | 'duplicado'
  | 'fk-faltante'
  | 'formato'
  | 'otro'

export type ClassifiedError = {
  raw: string
  family: ErrorFamily
  fila?: number       // # de la iniciativa si el error la menciona
}

export type ImportErrorSummary = {
  total: number
  banner: ImportErrorBanner | null
  items: ClassifiedError[]
}

export type ImportErrorBanner = {
  title:  string
  body:   string
  action: string
}

const RE_FILA = /#(\d+)\s*[:\-—·]/

/** Clasifica un string de error en una familia. */
export function classifyError(raw: string): ClassifiedError {
  const filaMatch = raw.match(RE_FILA)
  const fila = filaMatch ? Number(filaMatch[1]) : undefined
  const t = raw.toLowerCase()

  // Dato obligatorio faltante en parsing — el caso del Excel sin la columna.
  if (/(nombre|región|region|eje|ministerio)\s+requerid[ao]/i.test(raw)) {
    return { raw, family: 'dato-requerido', fila }
  }

  // Region no esta en el catalogo de 16.
  if (/región\s+".+"\s+no\s+reconocida/i.test(raw)) {
    return { raw, family: 'region-invalida', fila }
  }

  // Eje no esta en el catalogo de su region.
  if (/eje.*no.*catalog/i.test(raw) || /eje.*no\s+existe/i.test(raw)) {
    return { raw, family: 'eje-invalido', fila }
  }

  // RAT o valor enum invalido.
  if (/inválido|invalido|fuera\s+de\s+rango|valores?\s+v[aá]lidos?/i.test(raw)) {
    return { raw, family: 'valor-invalido', fila }
  }

  // Region del # no coincide con la del Excel.
  if (/el\s+#\s*\d+\s+corresponde\s+a\s+la\s+región/i.test(raw)) {
    return { raw, family: 'region-mismatch', fila }
  }

  // Permisos.
  if (/sin\s+permiso|permission\s+denied|insufficient\s+privilege/i.test(raw)
      || /42501/.test(raw)
      || /regional\s+solo\s+puede\s+modificar/i.test(raw)
      || /rol\s+.+\s+no\s+puede\s+modificar/i.test(raw)) {
    return { raw, family: 'permiso-denegado', fila }
  }

  // Postgres: duplicado.
  if (/duplicate\s+key/i.test(raw) || /23505/.test(raw)) {
    return { raw, family: 'duplicado', fila }
  }

  // Postgres: FK rota.
  if (/violates\s+foreign\s+key/i.test(raw) || /23503/.test(raw)) {
    return { raw, family: 'fk-faltante', fila }
  }

  // Postgres: invalid input syntax / formato (fechas, numeros).
  if (/invalid\s+input\s+syntax/i.test(raw) || /22p02/i.test(raw) || /formato.*inválid/i.test(raw)) {
    return { raw, family: 'formato', fila }
  }

  return { raw, family: 'otro', fila }
}

/**
 * Resume una lista de strings de error. Devuelve un banner explicativo si
 * detecta un patron dominante, mas la lista clasificada.
 */
export function summarizeImportErrors(errors: string[]): ImportErrorSummary {
  const items = errors.map(classifyError)
  const total = items.length

  if (total === 0) {
    return { total: 0, banner: null, items: [] }
  }

  // Conteo por familia para detectar patrones dominantes (>=70% de las filas).
  const byFamily = new Map<ErrorFamily, number>()
  for (const it of items) byFamily.set(it.family, (byFamily.get(it.family) ?? 0) + 1)

  const dominant = [...byFamily.entries()].sort((a, b) => b[1] - a[1])[0]
  const [topFamily, topCount] = dominant
  const dominantRatio = topCount / total

  const banner = bannerForDominant(topFamily, topCount, total, dominantRatio, items)

  return { total, banner, items }
}

function bannerForDominant(
  family: ErrorFamily,
  count: number,
  total: number,
  ratio: number,
  items: ClassifiedError[],
): ImportErrorBanner | null {
  // Solo emitimos banner cuando el patron es claramente dominante.
  if (ratio < 0.7) return null

  switch (family) {
    case 'dato-requerido': {
      // Distinguir cual columna esta faltando para guiar al usuario.
      const sample = items.find(it => it.family === 'dato-requerido')?.raw ?? ''
      const m = sample.match(/(nombre|región|region|eje|ministerio)\s+requerid/i)
      const columna = m ? prettyColumna(m[1]) : 'una columna obligatoria'
      const headerExacto = m ? exactHeaderHint(m[1]) : ''
      return {
        title: `${count} de ${total} filas marcan "${columna} requerid${columna === 'Nombre Iniciativa' ? 'o' : columna === 'Ministerio' ? 'o' : 'a'}"`,
        body:
          `Cuando todas las filas comparten el mismo error, es casi seguro que la columna ${columna} ` +
          `no se llama exactamente como el sistema espera. Tu archivo sí trae el dato, pero el parser ` +
          `no encuentra la columna por el nombre del encabezado.`,
        action:
          `Abre el .xlsx y en la fila de encabezados verifica que ${headerExacto || `la columna se llame exactamente "${columna}"`}. ` +
          `Recomendación: descarga el template oficial desde el botón "Bajar template" en este mismo panel y copia tus datos ahí — ` +
          `así evitas escribir los encabezados a mano.`,
      }
    }

    case 'region-invalida':
      return {
        title: `${count} filas con región no reconocida`,
        body:
          `El sistema mantiene un catálogo fijo de 16 regiones con nombre canónico. ` +
          `Si tu archivo tiene "Region Metropolitana" en vez de "Metropolitana", o "Magallanes y la Antártica" ` +
          `con error de escritura, el parser no la reconoce.`,
        action:
          `Revisa la columna "Región" y usa el nombre exacto del catálogo: ` +
          `Arica y Parinacota · Tarapacá · Antofagasta · Atacama · Coquimbo · Valparaíso · Metropolitana · ` +
          `O'Higgins · Maule · Ñuble · Biobío · La Araucanía · Los Ríos · Los Lagos · Aysén · Magallanes.`,
      }

    case 'eje-invalido':
      return {
        title: `${count} filas con eje inválido para su región`,
        body:
          `Cada región tiene su catálogo de ejes definido por la DCI. El parser valida que el eje del Excel ` +
          `exista en el catálogo de la región de esa fila — si la fila tiene un eje que no está listado para esa región, falla.`,
        action:
          `Verifica que el número y nombre del eje coincidan con los ejes oficiales de esa región. ` +
          `Si la región aún no tiene ese eje en su catálogo, pide a un administrador que lo agregue antes de cargar.`,
      }

    case 'region-mismatch':
      return {
        title: `${count} filas con región inconsistente`,
        body:
          `Estas filas tienen un # de iniciativa que existe en otra región distinta a la que pone el archivo. ` +
          `El # es la llave de actualización — no se puede mover una iniciativa entre regiones desde el import.`,
        action:
          `Si quieres actualizar iniciativas existentes, deja la región original. ` +
          `Si quieres crear iniciativas nuevas en una región, deja la columna # vacía.`,
      }

    case 'permiso-denegado':
      return {
        title: `${count} filas rechazadas por permisos`,
        body:
          `Tu rol no puede modificar los campos que estás intentando cambiar en estas iniciativas. ` +
          `Si eres regional: solo puedes editar semáforo, % avance, responsable, etapa, hito y foco — ` +
          `el resto se canaliza como propuesta para que un administrador la apruebe.`,
        action:
          `Quita de tu Excel los campos fuera de la whitelist regional, o pide a un administrador que cargue ` +
          `los cambios estructurales.`,
      }

    case 'duplicado':
      return {
        title: `${count} filas con valores duplicados`,
        body:
          `Estas filas intentan insertar valores que ya existen en una columna única (n, id, ` +
          `codigo_iniciativa). Puede pasar si dos filas del Excel comparten un identificador ` +
          `o si la iniciativa ya estaba cargada.`,
        action:
          `Revisa si esas filas tienen identificadores repetidos entre sí, o si ya existían en el ` +
          `sistema desde antes — en ese caso pásalas a UPDATE rellenando la columna #.`,
      }

    case 'formato':
      return {
        title: `${count} filas con formato inválido`,
        body:
          `Hay celdas con valores que no calzan con el tipo esperado: una fecha sin formato DD-MM-AAAA, ` +
          `un número con letras, o un texto donde se esperaba un número entero.`,
        action:
          `Verifica las columnas de fechas (Próximo Hito), numéricas (% Avance, Inversión) y enumeraciones (Semáforo, RAT).`,
      }

    case 'fk-faltante':
      return {
        title: `${count} filas referencian datos inexistentes`,
        body:
          `Estas filas apuntan a un eje, región o catálogo que no está en el sistema. Suele pasar al ` +
          `cargar ejes nuevos antes de que un administrador los registre.`,
        action:
          `Pide a un administrador que registre el catálogo faltante antes de reintentar la carga.`,
      }

    case 'valor-invalido':
      return {
        title: `${count} filas con valores fuera de las opciones permitidas`,
        body:
          `Hay celdas con valores que no están en la lista oficial (RAT, Semáforo, Prioridad, etc.).`,
        action:
          `Revisa que cada celda use uno de los valores listados en la fila de "descripción" del template oficial.`,
      }

    case 'otro':
    default:
      return null
  }
}

function prettyColumna(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower === 'nombre')     return 'Nombre Iniciativa'
  if (lower === 'región' || lower === 'region') return 'Región'
  if (lower === 'eje')        return 'Eje'
  if (lower === 'ministerio') return 'Ministerio'
  return raw
}

function exactHeaderHint(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower === 'nombre')
    return 'el encabezado sea EXACTAMENTE "Nombre Iniciativa" (con N y I en mayúscula, separadas por un espacio, sin tilde)'
  if (lower === 'región' || lower === 'region')
    return 'el encabezado sea EXACTAMENTE "Región" (con tilde en la o)'
  if (lower === 'eje')
    return 'el encabezado sea EXACTAMENTE "Eje"'
  if (lower === 'ministerio')
    return 'el encabezado sea EXACTAMENTE "Ministerio"'
  return ''
}
