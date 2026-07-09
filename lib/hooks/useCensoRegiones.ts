'use client'

import { useState, useEffect, useMemo } from 'react'
import { INE_CODE } from '@/lib/regions'

export type CensoRegionData = {
  nombre: string; cod: number
  n_per: number; n_hombres: number; n_mujeres: number
  n_edad_0_5: number; n_edad_6_13: number; n_edad_14_17: number
  n_edad_18_24: number; n_edad_25_44: number; n_edad_45_59: number; n_edad_60_mas: number
  n_inmigrantes: number; n_pueblos_orig: number; n_afrodescendencia: number; n_discapacidad: number
  n_dificultad_ver: number; n_dificultad_oir: number; n_dificultad_mover: number
  n_dificultad_cogni: number; n_dificultad_cuidado: number; n_dificultad_comunic: number
  n_analfabet: number; n_asistencia_parv: number; n_asistencia_basica: number
  n_asistencia_media: number; n_asistencia_superior: number
  n_cine_nunca_curso_primera_infancia: number; n_cine_primaria: number
  n_cine_secundaria: number; n_cine_terciaria_maestria_doctorado: number; n_cine_especial_diferencial: number
  n_ocupado: number; n_desocupado: number; n_fuera_fuerza_trabajo: number
  n_hog: number; n_vp: number; n_vp_ocupada: number; n_vp_desocupada: number
  n_hog_unipersonales: number; n_hog_60: number; n_hog_menores: number; n_jefatura_mujer: number
  n_tipo_viv_casa: number; n_tipo_viv_depto: number; n_tipo_viv_mediagua: number
  n_tipo_viv_indigena: number; n_tipo_viv_pieza: number; n_tipo_viv_movil: number; n_tipo_viv_otro: number
  n_tenencia_propia_pagada: number; n_tenencia_propia_pagandose: number
  n_tenencia_arrendada_contrato: number; n_tenencia_arrendada_sin_contrato: number
  n_tenencia_cedida_trabajo: number; n_tenencia_cedida_familiar: number; n_tenencia_otro: number
  n_viv_hacinadas: number; n_viv_irrecuperables: number
  n_deficit_cuantitativo: number; n_hog_allegados: number; n_nucleos_hacinados_allegados: number
  n_fuente_agua_publica: number; n_fuente_agua_pozo: number; n_fuente_agua_camion: number; n_fuente_agua_rio: number
  n_distrib_agua_llave: number; n_distrib_agua_llave_fuera: number; n_distrib_agua_acarreo: number
  n_serv_hig_alc_dentro: number; n_serv_hig_alc_fuera: number; n_serv_hig_fosa: number
  n_serv_hig_pozo: number; n_serv_hig_no_tiene: number
  n_fuente_elect_publica: number; n_fuente_elect_no_tiene: number
  n_basura_servicios: number; n_basura_entierra: number; n_basura_eriazo: number; n_basura_rio: number
  n_internet: number; n_serv_tel_movil: number; n_serv_compu: number; n_serv_tablet: number
  n_serv_internet_fija: number; n_serv_internet_movil: number; n_serv_internet_satelital: number
  n_comb_cocina_gas: number; n_comb_cocina_lena: number; n_comb_cocina_electricidad: number; n_comb_cocina_no_utiliza: number
  n_comb_calefaccion_gas: number; n_comb_calefaccion_lena: number
  n_comb_calefaccion_electricidad: number; n_comb_calefaccion_no_utiliza: number
  n_transporte_auto: number; n_transporte_publico: number; n_transporte_camina: number
  n_transporte_bicicleta: number; n_transporte_motocicleta: number
  prom_edad: number; prom_escolaridad18: number; prom_per_hog: number
}

const SUM_FIELDS: (keyof CensoRegionData)[] = [
  'n_per','n_hombres','n_mujeres','n_edad_0_5','n_edad_6_13','n_edad_14_17',
  'n_edad_18_24','n_edad_25_44','n_edad_45_59','n_edad_60_mas',
  'n_inmigrantes','n_pueblos_orig','n_afrodescendencia','n_discapacidad',
  'n_dificultad_ver','n_dificultad_oir','n_dificultad_mover',
  'n_dificultad_cogni','n_dificultad_cuidado','n_dificultad_comunic',
  'n_analfabet','n_asistencia_parv','n_asistencia_basica','n_asistencia_media','n_asistencia_superior',
  'n_cine_nunca_curso_primera_infancia','n_cine_primaria','n_cine_secundaria',
  'n_cine_terciaria_maestria_doctorado','n_cine_especial_diferencial',
  'n_ocupado','n_desocupado','n_fuera_fuerza_trabajo',
  'n_hog','n_vp','n_vp_ocupada','n_vp_desocupada',
  'n_hog_unipersonales','n_hog_60','n_hog_menores','n_jefatura_mujer',
  'n_tipo_viv_casa','n_tipo_viv_depto','n_tipo_viv_mediagua',
  'n_tipo_viv_indigena','n_tipo_viv_pieza','n_tipo_viv_movil','n_tipo_viv_otro',
  'n_tenencia_propia_pagada','n_tenencia_propia_pagandose',
  'n_tenencia_arrendada_contrato','n_tenencia_arrendada_sin_contrato',
  'n_tenencia_cedida_trabajo','n_tenencia_cedida_familiar','n_tenencia_otro',
  'n_viv_hacinadas','n_viv_irrecuperables',
  'n_deficit_cuantitativo','n_hog_allegados','n_nucleos_hacinados_allegados',
  'n_fuente_agua_publica','n_fuente_agua_pozo','n_fuente_agua_camion','n_fuente_agua_rio',
  'n_distrib_agua_llave','n_distrib_agua_llave_fuera','n_distrib_agua_acarreo',
  'n_serv_hig_alc_dentro','n_serv_hig_alc_fuera','n_serv_hig_fosa',
  'n_serv_hig_pozo','n_serv_hig_no_tiene',
  'n_fuente_elect_publica','n_fuente_elect_no_tiene',
  'n_basura_servicios','n_basura_entierra','n_basura_eriazo','n_basura_rio',
  'n_internet','n_serv_tel_movil','n_serv_compu','n_serv_tablet',
  'n_serv_internet_fija','n_serv_internet_movil','n_serv_internet_satelital',
  'n_comb_cocina_gas','n_comb_cocina_lena','n_comb_cocina_electricidad','n_comb_cocina_no_utiliza',
  'n_comb_calefaccion_gas','n_comb_calefaccion_lena',
  'n_comb_calefaccion_electricidad','n_comb_calefaccion_no_utiliza',
  'n_transporte_auto','n_transporte_publico','n_transporte_camina',
  'n_transporte_bicicleta','n_transporte_motocicleta',
]

function buildNacional(arr: CensoRegionData[]): CensoRegionData {
  const agg = { nombre: 'Nacional', cod: 0 } as CensoRegionData
  for (const f of SUM_FIELDS) {
    (agg as Record<string, unknown>)[f as string] = arr.reduce((s, r) => s + ((r[f] as number) || 0), 0)
  }
  const tp = agg.n_per
  const th = agg.n_hog
  agg.prom_edad           = arr.reduce((s, r) => s + r.prom_edad * r.n_per, 0) / tp
  agg.prom_escolaridad18  = arr.reduce((s, r) => s + r.prom_escolaridad18 * r.n_per, 0) / tp
  agg.prom_per_hog        = arr.reduce((s, r) => s + r.prom_per_hog * r.n_hog, 0) / th
  return agg
}

export function useCensoRegiones() {
  const [byCode, setByCode] = useState<Record<number, CensoRegionData> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/data/censo_regiones.json')
      .then(r => r.json())
      .then((json: { datos: Record<string, CensoRegionData> }) => {
        if (cancelled) return
        const map: Record<number, CensoRegionData> = {}
        for (const [k, v] of Object.entries(json.datos)) map[Number(k)] = v
        setByCode(map)
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const nacional = useMemo(
    () => (byCode ? buildNacional(Object.values(byCode)) : null),
    [byCode]
  )

  function get(regionCod: string): CensoRegionData | null {
    if (!regionCod) return nacional
    if (!byCode) return null
    return byCode[INE_CODE[regionCod]] ?? null
  }

  return { byCode, loading, nacional, get }
}
