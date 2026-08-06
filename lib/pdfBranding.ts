import path from 'path'
import fs from 'fs'

/**
 * Lectores memoizados del branding institucional para los PDF (logo del
 * encabezado + banda del Gobierno de Chile del pie). Mismo par de assets que
 * usa app/api/minuta/route.ts; extraído acá para que las actas de sesión
 * (lib/sesiones/generarActa*.ts) compartan el mismo encabezado/pie sin
 * duplicar la lectura de disco.
 *
 * Devuelven un data URL base64 o `null` si el archivo no está (los renderers
 * degradan a un placeholder cuando falta). Se leen una sola vez por proceso.
 *
 * NOTA: logo-pdf.png es un PNG RGB convertido del JPEG CMYK original —
 * react-pdf v4 corrompe el layout con JPEG CMYK (4 componentes).
 */

function readPngDataUrl(fileName: string): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', fileName))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

let _logo: string | null | undefined
let _footerBanner: string | null | undefined

/** Logo institucional (encabezado de los PDF). */
export function getLogoDataUrl(): string | null {
  if (_logo === undefined) _logo = readPngDataUrl('logo-pdf.png')
  return _logo
}

/** Banda "Gobierno de Chile" a sangre completa (pie de los PDF). */
export function getFooterBannerDataUrl(): string | null {
  if (_footerBanner === undefined) _footerBanner = readPngDataUrl('footer-gobierno-chile.png')
  return _footerBanner
}
