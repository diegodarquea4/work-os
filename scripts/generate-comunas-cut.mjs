// Genera data/comunas-cut.json desde los 16 geojson comunales de public/comunas/.
// One-shot (re-ejecutable): los geojson son la MISMA fuente que dibuja el mapa,
// así el catálogo del matcher nunca puede divergir de lo que se ve en pantalla.
//
//   node scripts/generate-comunas-cut.mjs
//
// Salida: [{ cut, nombre, regionIne }] ordenado por cut.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'public', 'comunas')
const OUT = path.join(ROOT, 'data', 'comunas-cut.json')

const comunas = []
for (let ine = 1; ine <= 16; ine++) {
  const gj = JSON.parse(fs.readFileSync(path.join(SRC, `${ine}.geojson`), 'utf-8'))
  for (const f of gj.features) {
    const { cod_comuna, comuna, codregion } = f.properties
    if (codregion !== ine) {
      throw new Error(`codregion ${codregion} != archivo ${ine}.geojson (comuna ${comuna})`)
    }
    comunas.push({ cut: cod_comuna, nombre: comuna, regionIne: ine })
  }
}

comunas.sort((a, b) => a.cut - b.cut)

const dups = comunas.filter((c, i) => i > 0 && comunas[i - 1].cut === c.cut)
if (dups.length) throw new Error(`CUT duplicados: ${dups.map(d => d.cut).join(', ')}`)

fs.writeFileSync(OUT, JSON.stringify(comunas, null, 1) + '\n')
console.log(`${comunas.length} comunas → ${path.relative(ROOT, OUT)}`)
