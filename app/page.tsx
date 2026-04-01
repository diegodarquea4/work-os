import fs from 'fs'
import path from 'path'
import type { GeoJsonObject } from 'geojson'
import { getProjects } from '@/lib/projects'
import WorkOSApp from '@/components/WorkOSApp'

export default function Home() {
  const projects = getProjects()
  const geoData: GeoJsonObject = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'public', 'chile-regiones.geojson'), 'utf-8')
  )
  return <WorkOSApp projects={projects} geoData={geoData} />
}
