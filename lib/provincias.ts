/**
 * Nombres de provincias por región (mig 094 — desglose estandarizado del
 * Comité Policial). Fuente: `data/provincias-comunas.json`, hasta ahora usado
 * solo por el Kit de Viaje (`lib/kitDeViaje/assembler.ts`). No hay código
 * numérico oficial de provincia en el repo — se usa el NOMBRE como llave
 * estable: viene de una lista fija (nunca tipeado a mano), así que no hay
 * riesgo de typo aunque no sea un código.
 *
 * El JSON trae el nombre con la capital entre paréntesis para el Kit de Viaje
 * ("Valparaíso (capital regional)") — acá se limpia para mostrar y usar como
 * llave solo el nombre de la provincia.
 */

import provinciasComunas from '@/data/provincias-comunas.json'

type ProvinciasComunasJson = Record<string, { provincias: { nombre: string; comunas: string }[] }>

const DATA = provinciasComunas as ProvinciasComunasJson

function limpiarNombreProvincia(nombre: string): string {
  return nombre.replace(/\s*\(capital[^)]*\)\s*$/i, '').trim()
}

/** Nombres de las provincias de una región, en el orden del catálogo. `[]` si
 *  la región no está en el catálogo (no debería pasar — cubre las 16). */
export function provinciasDeRegion(regionCod: string): string[] {
  return (DATA[regionCod]?.provincias ?? []).map(p => limpiarNombreProvincia(p.nombre))
}
