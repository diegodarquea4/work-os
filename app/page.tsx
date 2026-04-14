import fs from 'fs'
import path from 'path'
import type { GeoJsonObject } from 'geojson'
import WorkOSApp from '@/components/WorkOSApp'

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

  const geoData: GeoJsonObject = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'public', 'chile-regiones.geojson'), 'utf-8')
  )

  return <WorkOSApp projects={projects} geoData={geoData} />
}
