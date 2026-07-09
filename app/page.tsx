import fs from 'fs'
import path from 'path'
import type { GeoJsonObject } from 'geojson'
import WorkOSApp from '@/components/WorkOSApp'

// Always fetch fresh data from Supabase — never serve a cached page
export const dynamic = 'force-dynamic'

// El GeoJSON de las 16 regiones no cambia entre requests. Se parsea UNA vez por
// proceso del server (a nivel de módulo) en vez de con readFileSync síncrono +
// JSON.parse en cada request (bloqueaba el event loop en el path crítico).
const geoData: GeoJsonObject = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public', 'chile-regiones.geojson'), 'utf-8')
)

export default async function Home() {
  // Load projects: Supabase when env vars are set, CSV file as fallback
  let projects
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON) {
    const { getAllIniciativas } = await import('@/lib/db')
    projects = await getAllIniciativas()
  } else {
    const { getIniciativas } = await import('@/lib/projects')
    projects = getIniciativas()
  }

  return <WorkOSApp projects={projects} geoData={geoData} />
}
