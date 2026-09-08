import { describe, it, expect, afterEach } from 'vitest'
import { isCronAuthorized } from '@/lib/cronAuth'

/**
 * Las rutas de sync están FUERA del gate de sesión de proxy.ts y escriben con
 * service-role. Este chequeo es su único control de acceso, así que los casos
 * de abajo son los que evitan que vuelva a abrirse: el encabezado forjable, el
 * secreto ausente y el "Bearer undefined".
 */

const original = process.env.CRON_SECRET
afterEach(() => { process.env.CRON_SECRET = original })

function req(headers: Record<string, string>): Request {
  return new Request('https://work-os-theta.vercel.app/api/ine-sync', { headers })
}

describe('isCronAuthorized', () => {
  it('acepta el bearer correcto', () => {
    process.env.CRON_SECRET = 'secreto-de-prueba'
    expect(isCronAuthorized(req({ authorization: 'Bearer secreto-de-prueba' }))).toBe(true)
  })

  it('rechaza el encabezado x-vercel-cron (lo pone el cliente, no Vercel)', () => {
    process.env.CRON_SECRET = 'secreto-de-prueba'
    expect(isCronAuthorized(req({ 'x-vercel-cron': '1' }))).toBe(false)
  })

  it('rechaza un bearer equivocado, vacío o sin el prefijo', () => {
    process.env.CRON_SECRET = 'secreto-de-prueba'
    expect(isCronAuthorized(req({ authorization: 'Bearer otro' }))).toBe(false)
    expect(isCronAuthorized(req({ authorization: 'secreto-de-prueba' }))).toBe(false)
    expect(isCronAuthorized(req({ authorization: '' }))).toBe(false)
    expect(isCronAuthorized(req({}))).toBe(false)
  })

  it('falla cerrado si CRON_SECRET no está configurado', () => {
    // Sin esto, `Bearer ${undefined}` sería una llave universal conocida.
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(req({ authorization: 'Bearer undefined' }))).toBe(false)
    expect(isCronAuthorized(req({ authorization: 'Bearer ' }))).toBe(false)
    expect(isCronAuthorized(req({}))).toBe(false)
  })

  it('no se confunde con un secreto que sea prefijo del enviado', () => {
    process.env.CRON_SECRET = 'abc'
    expect(isCronAuthorized(req({ authorization: 'Bearer abcd' }))).toBe(false)
  })
})
