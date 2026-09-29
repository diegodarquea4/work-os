'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Importar los oficios pendientes del SEIA desde el Excel de seia-abierto.cl.
 *
 * Vive en /admin y no en el panel del Comité Económico por dos razones: la
 * importación es NACIONAL —escribe en las 16 regiones de una— y la hace
 * admin/editor, no quien conduce un comité. La segunda es práctica: el panel
 * del comité está cambiando en otra rama y esta pantalla no tiene por qué
 * esperarla.
 *
 * Es deliberadamente fea y directa: elegir archivo, subir, leer el resumen.
 * La pantalla que el comité va a usar —la lista de oficios en la sesión— es
 * otra cosa y se diseña con los números de acá a la vista.
 */

type Importacion = {
  id: number
  fecha_corte: string | null
  archivo_nombre: string | null
  filas_leidas: number
  filas_nuevas: number
  filas_actualizadas: number
  filas_resueltas: number
  filas_sin_region: number
  detalle: { descartadas?: { fila: number; motivo: string; proyecto: string | null }[]; sin_asignar?: number } | null
  importado_por_email: string | null
  created_at: string
}

type Scrape = {
  partial: boolean
  proyectos: number
  procesados: number
  desde: number
  hasta: number
  pendientes_escritos: number
  resueltos: number
  fallados: number
  errores: string[]
}

type Revinculacion = {
  revisados: number
  vinculados: number
  mudados: number
  ambiguos: number
  sin_proyecto: number
}

/** A partir de cuántos días el dato se considera viejo. El comité sesiona cada
 *  15 días: si el archivo pasa de eso, ya no cubre la reunión que viene. */
const DIAS_PARA_ENVEJECER = 15

export default function OficiosSeiaPage() {
  const [historial, setHistorial] = useState<Importacion[]>([])
  const [cargando, setCargando]   = useState(true)
  const [subiendo, setSubiendo]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [ultimo, setUltimo]       = useState<Importacion | null>(null)
  const [revinculando, setRevinculando] = useState(false)
  const [scrapeando, setScrapeando]     = useState(false)
  const [scrape, setScrape]             = useState<Scrape | null>(null)
  const [progreso, setProgreso]         = useState<string | null>(null)
  const [vinculo, setVinculo]     = useState<Revinculacion | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await getSupabase()
      .from('seia_oficios_import')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistorial((data ?? []) as Importacion[])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function subir(archivo: File) {
    setSubiendo(true)
    setError(null)
    setUltimo(null)
    try {
      const body = new FormData()
      body.append('archivo', archivo)
      const res = await fetch('/api/oficios-seia/import', { method: 'POST', body })
      const json = await res.json()
      // El detalle de Postgres se muestra tal cual: es feo, pero es lo único
      // que dice qué arreglar.
      if (!res.ok) throw new Error([json.error, json.detalle].filter(Boolean).join('\n\n') || 'La importación falló')
      setUltimo(json as Importacion)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  /**
   * Lee el SEIA directo, sin archivo. La ruta es reanudable —corta a 240s y
   * devuelve partial— así que acá se la vuelve a llamar hasta que termine,
   * igual que hace el botón «Actualizar proyectos en SEIA» del comité.
   */
  async function scrapear() {
    setScrapeando(true)
    setError(null)
    setScrape(null)
    setProgreso(null)
    try {
      const acum: Scrape = {
        partial: false, proyectos: 0, procesados: 0, desde: 0, hasta: 0,
        pendientes_escritos: 0, resueltos: 0, fallados: 0, errores: [],
      }
      // Tope de vueltas: sin él, una ruta que devolviera partial siempre
      // dejaría la pantalla girando para siempre.
      for (let vuelta = 0; vuelta < 12; vuelta++) {
        const res = await fetch('/api/oficios-seia/scrape', { method: 'POST' })
        const json = await res.json()
        if (!res.ok) throw new Error([json.error, json.detalle].filter(Boolean).join(String.fromCharCode(10, 10)) || 'El scraping falló')
        const j = json as Scrape
        acum.proyectos = j.proyectos
        acum.procesados += j.procesados
        acum.hasta = j.hasta
        acum.pendientes_escritos += j.pendientes_escritos
        acum.resueltos += j.resueltos
        acum.fallados += j.fallados
        acum.errores = [...acum.errores, ...(j.errores ?? [])].slice(0, 20)
        acum.partial = j.partial
        setProgreso(`${j.hasta} de ${j.proyectos} proyectos`)
        if (!j.partial) break
      }
      setScrape(acum)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScrapeando(false)
      setProgreso(null)
    }
  }

  async function revincular() {
    setRevinculando(true)
    setError(null)
    setVinculo(null)
    try {
      const res = await fetch('/api/oficios-seia/revincular', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error([json.error, json.detalle].filter(Boolean).join('\n\n') || 'La revinculación falló')
      setVinculo(json as Revinculacion)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRevinculando(false)
    }
  }

  const reciente = historial[0] ?? null
  const dias = reciente?.fecha_corte
    ? Math.floor((Date.now() - Date.parse(`${reciente.fecha_corte}T12:00:00`)) / 86_400_000)
    : null
  const viejo = dias != null && dias > DIAS_PARA_ENVEJECER

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-slate-900">Oficios pendientes del SEIA</h1>
      <p className="text-sm text-gray-500 mt-1">
        El panel lee el SEIA solo los lunes, miércoles y viernes. El Excel de <span className="font-medium">seia-abierto.cl → Proyectos en calificación → Detalle
        oficios pendientes → Descargar datos</span>. Reimportar el mismo archivo no duplica nada.
      </p>

      {/* La fecha que importa es la de CORTE del archivo, no la de la subida:
          un archivo bajado el lunes y subido el miércoles sigue siendo del
          lunes, y es lo que hay que mirar para saber si quedó viejo. */}
      {reciente && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          viejo ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          <span className="font-semibold">
            Datos al {reciente.fecha_corte ?? '—'}
          </span>
          {dias != null && (
            <span> · hace {dias} día{dias === 1 ? '' : 's'}</span>
          )}
          {viejo && (
            <span className="block mt-1 font-medium">
              El archivo tiene más de {DIAS_PARA_ENVEJECER} días: ya no cubre la próxima sesión del comité.
            </span>
          )}
        </div>
      )}

      {/* Leer el SEIA directo va PRIMERO: es lo que reemplaza a la subida, y
          la subida queda como respaldo para cuando el SEIA cambie de forma o
          haga falta la fecha límite oficial. */}
      <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Leer el SEIA directamente</p>
            <p className="text-xs text-gray-600 mt-1 max-w-xl">
              Recorre los proyectos de la cartera que tienen expediente y lee sus oficios
              pendientes del SEIA público, sin archivo. Corre solo los lunes, miércoles y
              viernes; esto es para adelantarlo.
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5 max-w-xl">
              La fecha límite la <strong>calcula</strong>: el SEIA no la publica por organismo.
              Puede errar un día. Si subís el Excel, esa fecha —que sí es oficial— la pisa.
            </p>
          </div>
          <button
            onClick={scrapear}
            disabled={scrapeando || subiendo}
            className="shrink-0 px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-50"
          >
            {scrapeando ? (progreso ?? 'Leyendo…') : 'Leer ahora'}
          </button>
        </div>

        {scrape && (
          <div className="mt-4 rounded-lg border border-violet-200 bg-white px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Dato n={scrape.hasta}               label="proyectos leídos" />
              <Dato n={scrape.pendientes_escritos} label="pendientes nuevos" />
              <Dato n={scrape.resueltos}           label="resueltos" />
              <Dato n={scrape.fallados}            label="fallaron" alerta={scrape.fallados > 0} />
            </div>
            {scrape.partial && (
              <p className="text-xs text-amber-800 mt-2">
                Quedó a medias en el proyecto {scrape.hasta} de {scrape.proyectos}. Volvé a
                apretar: retoma donde quedó.
              </p>
            )}
            {scrape.errores.length > 0 && (
              // Un expediente que falla se reintenta solo en la corrida
              // siguiente, pero si falla siempre hay que poder verlo.
              <details className="mt-2">
                <summary className="text-xs text-amber-800 cursor-pointer font-medium">
                  Ver los expedientes que fallaron
                </summary>
                <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                  {scrape.errores.map((e, i) => (
                    <li key={i} className="text-[11px] text-gray-500">{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={subiendo}
          onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }}
          className="block mx-auto text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-violet-700 file:text-white file:font-semibold file:cursor-pointer disabled:opacity-50"
        />
        {subiendo && <p className="text-sm text-violet-700 mt-3 font-medium">Importando…</p>}
      </div>

      {/* Revincular va DESPUÉS de la subida pero se usa más seguido: sumar un
          proyecto a la cartera no debería obligar a rebajar el Excel para que
          sus oficios aparezcan. La importación ya cruza contra la cartera,
          pero contra la que existía en ese instante. */}
      <div className="mt-5 rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Revincular con la cartera</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              Cruza los oficios ya importados con los proyectos de la cartera. Corré esto cada vez
              que sumes un proyecto: la importación los une con la cartera <strong>tal como estaba
              al subir el archivo</strong>, así que un proyecto agregado después queda con sus
              oficios sueltos hasta que corras esto. No desvincula nada.
            </p>
          </div>
          <button
            onClick={revincular}
            disabled={revinculando}
            className="shrink-0 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {revinculando ? 'Revinculando…' : 'Revincular'}
          </button>
        </div>

        {vinculo && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-800">
              {vinculo.vinculados === 0
                ? <>Ningún oficio nuevo encontró proyecto. Se revisaron <strong>{vinculo.revisados}</strong> sin asignar.</>
                : <><strong>{vinculo.vinculados}</strong> oficio{vinculo.vinculados === 1 ? '' : 's'} quedaron pegados a su proyecto.</>}
            </p>
            {vinculo.mudados > 0 && (
              // No es un efecto raro: un oficio sin proyecto se guarda en la
              // región que declara el SEIA, y al aparecer el proyecto manda la
              // región del proyecto. Decirlo evita que parezca un error.
              <p className="text-xs text-slate-600 mt-1">
                {vinculo.mudados} cambiaron de región: al encontrar su proyecto, mandan la región de la cartera
                y no la que declara el SEIA.
              </p>
            )}
            {vinculo.ambiguos > 0 && (
              <p className="text-xs text-amber-800 mt-1">
                {vinculo.ambiguos} quedaron sin resolver porque su expediente está en la cartera de
                más de una región. Se reparten en la próxima importación.
              </p>
            )}
            {vinculo.sin_proyecto > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {vinculo.sin_proyecto} siguen sin proyecto: el archivo es nacional y su proyecto no está en
                ninguna cartera.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-line">
          {error}
        </div>
      )}

      {ultimo && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-900">Importación lista</p>
          {/* «Con proyecto» es el número que de verdad dice si esto sirve: un
              oficio sin proyecto no aparece en ninguna ficha ni en la sesión
              de nadie. «Re-enganchadas» solo cuenta los que YA existían y
              recién ahora encontraron su proyecto, así que en la primera
              importación siempre da cero — mostrarlo solo a él hacía parecer
              que el vínculo estaba roto sin decir nada útil. */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3 text-center">
            <Dato n={ultimo.filas_leidas}       label="leídas" />
            <Dato n={ultimo.filas_nuevas}       label="nuevas" />
            <Dato n={vinculadas(ultimo)}        label="con proyecto" />
            <Dato n={ultimo.detalle?.sin_asignar ?? 0} label="sin asignar" alerta={(ultimo.detalle?.sin_asignar ?? 0) > 0} />
            <Dato n={ultimo.filas_resueltas}    label="resueltas" />
            <Dato n={ultimo.filas_sin_region}   label="descartadas" alerta={ultimo.filas_sin_region > 0} />
          </div>
          {vinculadas(ultimo) === 0 && ultimo.filas_nuevas > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
              Ningún oficio quedó pegado a un proyecto de la cartera. Un oficio se une a su
              proyecto por el <strong>expediente del SEIA</strong>, y eso solo lo tienen los
              proyectos importados del catálogo. Cargá el expediente en la ficha de cada
              proyecto y volvé a importar: se enganchan solos.
            </p>
          )}
          {/* Lo descartado se muestra siempre: una fila que se pierde en
              silencio es un oficio que el comité no va a ver y nadie va a
              saber por qué. */}
          {!!ultimo.detalle?.descartadas?.length && (
            <details className="mt-3">
              <summary className="text-xs text-green-900 cursor-pointer font-medium">
                Ver las {ultimo.filas_sin_region} filas que no entraron
              </summary>
              <ul className="mt-2 space-y-0.5 max-h-56 overflow-y-auto">
                {ultimo.detalle.descartadas.map(d => (
                  <li key={d.fila} className="text-[11px] text-green-900/80">
                    <span className="tabular-nums">fila {d.fila}</span> · {d.proyecto ?? '—'} — {d.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <h2 className="text-sm font-bold text-slate-900 mt-8 mb-2">Importaciones anteriores</h2>
      {cargando ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no se importó ningún archivo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead className="text-gray-500">
              <tr className="[&_th]:text-left [&_th]:font-semibold [&_th]:py-1.5 [&_th]:pr-3 [&_th]:border-b [&_th]:border-gray-200">
                <th>Corte</th><th>Archivo</th><th>Leídas</th><th>Nuevas</th>
                <th>Con proyecto</th><th>Resueltas</th><th>Fuera</th><th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(h => (
                <tr key={h.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 tabular-nums">{h.fecha_corte ?? '—'}</td>
                  <td className="py-1.5 pr-3 max-w-[180px] truncate text-gray-600">{h.archivo_nombre ?? '—'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_leidas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_nuevas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{vinculadas(h)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_resueltas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_sin_region}</td>
                  <td className="py-1.5 pr-3 text-gray-500 max-w-[160px] truncate">{h.importado_por_email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Cuántos de los recién entrados quedaron pegados a un proyecto. */
function vinculadas(i: Importacion): number {
  return Math.max(0, i.filas_nuevas - (i.detalle?.sin_asignar ?? 0))
}

function Dato({ n, label, alerta = false }: { n: number; label: string; alerta?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${alerta ? 'text-amber-700' : 'text-green-900'}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-wide text-green-900/60">{label}</p>
    </div>
  )
}
