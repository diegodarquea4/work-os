// ==========================================================================
// Desalojos v3 — config canónica de tipologías, fases, checklists por fase
//                + matriz jurídica + protocolo de aseguramiento de financiamiento.
//
// La metodología real de la Mesa Interministerial (minuta 038, mayo 2026) se
// organiza POR FASE, no por dimensión transversal. Las 4 dimensiones del v2
// (Jurídico / Seguridad / Social / Financiamiento) son atributos que viven
// dentro de cada fase, no en paralelo:
//
//   PR — Prerrequisitos jurídicos + financiamiento (vive lo "Jurídico")
//   F1 — Intervención policial (vive lo "Seguridad")
//   F2 — Catastro social (vive lo "Social")
//   F3 — Desalojo (vive lo "Seguridad operativa")
//   F4 — Demolición simultánea (vive lo "Financiamiento")
//   F5 — Recuperación
//
// Cada tipología (A/B/C/D) tiene un checklist específico POR FASE. Los items
// vienen literal de la Sección V del 038.
//
// Reglas duras:
//   - PR → F1: bloqueado si semáforo PR no está verde o si quedan items
//     obligatorios sin completar en el checklist PR.
//   - F3 y F4 son SIMULTÁNEAS (regla del PDF: sin demolición simultánea hay
//     retoma). La UI las muestra como par; el modelo las mantiene discretas.
//   - F4 no se autoriza sin financiamiento asegurado.
//
// El UI no nombra entes presupuestarios específicos (decisión de diseño:
// el flag es operativo, no compromete a un ministerio puntual).
//
// Sin override (decisión Mesa, "sin excepción").
// ==========================================================================

import type {
  DesalojoCapa,
  DesalojoChecklistEstado,
  DesalojoChecklistItemEstado,
  DesalojoFase,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoTipologia,
  SemaforoDimension,
} from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────
// FASES — vocabulario corto consistente con el tablero del PDF
// ─────────────────────────────────────────────────────────────────────────

export const FASE_ORDEN: DesalojoFase[] = ['pr', 'f1', 'f2', 'f3', 'f4', 'f5', 'cerrado']
export const FASES_CON_SEMAFORO: DesalojoFaseConSemaforo[] = ['pr', 'f1', 'f2', 'f3', 'f4', 'f5']

export const FASE_CFG: Record<DesalojoFase, {
  label:       string         // texto completo
  short:       string         // sigla en círculos del stepper
  sublabel:    string         // bajo el sigla
  descripcion: string
}> = {
  pr:      { label: 'Prerrequisitos',         short: 'PR',  sublabel: 'PR',       descripcion: 'Instrumento jurídico habilitante + financiamiento confirmado. Sin esto no se autoriza F1.' },
  f1:      { label: 'Intervención policial',  short: 'F1',  sublabel: 'F1',       descripcion: 'Plan operativo de Carabineros con contingente dimensionado.' },
  f2:      { label: 'Catastro social',        short: 'F2',  sublabel: 'F2',       descripcion: 'Hogares, NNA, AM, embarazadas, discapacidad, migrantes. Albergue validado.' },
  f3:      { label: 'Desalojo',               short: 'F3',  sublabel: 'F3',       descripcion: 'Despeje del polígono. Simultáneo a F4 (sin demolición hay retoma).' },
  f4:      { label: 'Demolición simultánea',  short: 'F4',  sublabel: 'F4',       descripcion: 'Demolición manzana a manzana. Requiere financiamiento asegurado.' },
  f5:      { label: 'Recuperación',           short: 'F5',  sublabel: 'F5',       descripcion: 'Cierre perimetral y nuevo uso del suelo.' },
  cerrado: { label: 'Caso cerrado',           short: 'OK',  sublabel: 'Cerrado',  descripcion: 'Polígono recuperado.' },
}

// ─────────────────────────────────────────────────────────────────────────
// TIPOLOGÍAS — configurador metodológico
// ─────────────────────────────────────────────────────────────────────────
// Paleta: A=indigo, B=cyan, C=violet, D=orange. Evita verde/rojo (semáforos)
// y amber (en_foco). Tokens validados para no competir.

// Campo estructurado asociado a un item del checklist. La existencia de un
// extra `required` sin valor hace que el item NO cuente como "done" para
// canAdvanceFase, aunque el bool del check esté marcado. Esto vuelve honesto
// el chequeo: no se puede decir "resolución publicada" sin la resolución.
export type ExtraSpec =
  | { kind: 'texto'; key: string; label: string; placeholder?: string; required?: boolean }
  | { kind: 'num';   key: string; label: string; unit?: string; required?: boolean }
  | { kind: 'fecha'; key: string; label: string; required?: boolean }
  | { kind: 'doc';   key: string; label: string; required?: boolean; hint?: string }

export type ChecklistItem = {
  key:         string
  label:       string
  descripcion?: string
  /** Campos estructurados que acompañan al check. Si alguno es `required` y
   *  no tiene valor, el item se considera incompleto aunque `done === true`. */
  extras?:     ExtraSpec[]
}
export type ChecklistsFase = Record<DesalojoFaseConSemaforo, ChecklistItem[]>

export type RolCfg = {
  key:         string
  label:       string
  descripcion?: string
  /** Si es required, aparece destacado con asterisco en la pestaña Responsables. */
  required?:   boolean
}

export type TipologiaCfg = {
  label:                  string
  short:                  DesalojoTipologia
  chip:                   { bg: string; text: string; ring: string }
  financiamiento_default: string
  rol_dpr:                string
  nudo_critico:           string
  /**
   * Fases del flujo que aplican a esta tipología. El UI filtra stepper, cards,
   * miniDots, tablero y rollup por esta lista. Las filas en DB para fases no
   * aplicables se conservan silenciosamente (regla: si la tipología cambia y
   * vuelven a aplicar, reaparecen intactas).
   */
  fases_aplicables:       DesalojoFaseConSemaforo[]
  /** Checklist específico de la tipología por cada una de las 6 fases. */
  checklists:             ChecklistsFase
  /**
   * Roles humanos responsables del caso bajo esta tipología. Llenado por capa
   * en desalojo_capas.responsables (JSONB). Cambio de tipología conserva
   * responsables huérfanos.
   */
  roles:                  RolCfg[]
}

// Checklists base reutilizados (F2, F3, F5 son bastante comunes entre tipologías).
const CHECKLIST_F2_BASE: ChecklistItem[] = [
  { key: 'catastro_social_levantado', label: 'Catastro social levantado',
    descripcion: 'Hogares, NNA, AM, embarazadas, discapacidad, migrantes.',
    extras: [
      { kind: 'fecha', key: 'fecha_levantamiento', label: 'Fecha del levantamiento', required: true },
      { kind: 'doc',   key: 'catastro',            label: 'Catastro (PDF / planilla)', required: true,
        hint: 'Documento con la composición demográfica del polígono.' },
    ],
  },
  { key: 'oferta_albergue_validada',  label: 'Oferta de albergue validada',
    extras: [
      { kind: 'num', key: 'cupos',    label: 'Cupos disponibles', unit: 'personas', required: true },
      { kind: 'doc', key: 'convenio', label: 'Convenio / oferta firmada',
        hint: 'Albergue MIDESO, fundación, municipio, etc.' },
    ],
  },
  { key: 'protocolo_21430_activado',  label: 'Protocolo Ley 21.430 activado (si hay NNA)',
    descripcion: 'Articulado con Oficinas Locales de la Niñez.',
    extras: [
      { kind: 'fecha', key: 'fecha_activacion', label: 'Fecha de activación' },
    ],
  },
  { key: 'derivaciones_sociales_listas', label: 'Derivaciones a subsidios / servicios coordinadas',
    extras: [
      { kind: 'doc', key: 'listado', label: 'Listado de derivaciones',
        hint: 'Familias × subsidio o servicio derivado.' },
    ],
  },
]

const CHECKLIST_F3_BASE: ChecklistItem[] = [
  { key: 'fecha_operativo_fijada',     label: 'Fecha de operativo fijada',
    extras: [
      { kind: 'fecha', key: 'fecha_operativo', label: 'Fecha del operativo', required: true },
    ],
  },
  { key: 'cuadrantes_definidos',       label: 'Cuadrantes / etapas definidos',
    extras: [
      { kind: 'doc', key: 'mapa_cuadrantes', label: 'Mapa de cuadrantes', required: true,
        hint: 'Plano del polígono con cuadrantes/etapas numeradas.' },
    ],
  },
  { key: 'resguardo_perimetral_coord', label: 'Resguardo perimetral coordinado con Carabineros',
    extras: [
      { kind: 'doc', key: 'plan_resguardo', label: 'Plan de resguardo perimetral' },
    ],
  },
  { key: 'derivacion_nna_lista',       label: 'Derivación de NNA a albergues transitorios preparada',
    extras: [
      { kind: 'doc', key: 'listado_nna', label: 'Listado NNA → albergue',
        hint: 'Familias y albergue asignado.' },
    ],
  },
]

const CHECKLIST_F5_BASE: ChecklistItem[] = [
  { key: 'cierre_perimetral_financiado', label: 'Cierre perimetral definitivo financiado',
    extras: [
      { kind: 'num',   key: 'monto_mm', label: 'Monto', unit: 'MM CLP', required: true },
      { kind: 'texto', key: 'fuente',   label: 'Fuente de recursos', required: true,
        placeholder: 'Servicio propietario / FNDR / Municipal / otro' },
    ],
  },
  { key: 'nuevo_uso_suelo_definido',     label: 'Nuevo uso del suelo definido',
    descripcion: 'Articulado MINVU regional + municipio + GORE.',
    extras: [
      { kind: 'texto', key: 'uso',         label: 'Uso definido', placeholder: 'Ej. parque, equipamiento público, plan habitacional' },
      { kind: 'doc',   key: 'instrumento', label: 'Instrumento (Plan Maestro / convenio / decreto)' },
    ],
  },
]

export const TIPOLOGIA_CFG: Record<DesalojoTipologia, TipologiaCfg> = {
  A: {
    label: 'Fiscal SERVIU',
    short: 'A',
    chip: { bg: 'bg-indigo-100', text: 'text-indigo-700', ring: 'ring-indigo-300' },
    financiamiento_default: 'SERVIU (presupuesto habitacional)',
    rol_dpr: 'Conduce el operativo, solicita fuerza pública.',
    nudo_critico: 'Financiamiento de demolición.',
    fases_aplicables: ['pr', 'f1', 'f2', 'f3', 'f4', 'f5'],
    roles: [
      { key: 'dpr',           label: 'Delegada/o Presidencial Regional', required: true,
        descripcion: 'Conduce el caso en la región. Convoca Comité Caso.' },
      { key: 'serviu',        label: 'Director/a SERVIU regional', required: true,
        descripcion: 'Resolución de desalojo + financiamiento de demolición.' },
      { key: 'carabineros',   label: 'Jefatura de Carabineros (Zona/Prefectura)', required: true,
        descripcion: 'Plan operativo + contingente.' },
      { key: 'mideso',        label: 'SEREMI Desarrollo Social y Familia', required: true,
        descripcion: 'Catastro social + albergues + protocolo 21.430.' },
      { key: 'validacion_presupuestaria', label: 'Validación presupuestaria',
        descripcion: 'Confirmación de recursos para la demolición. Definir caso a caso.' },
      { key: 'mma_salud',     label: 'SEREMI Salud + MMA',
        descripcion: 'Residuos peligrosos y vertedero autorizado.' },
      { key: 'municipio',     label: 'Municipalidad',
        descripcion: 'Cierre perimetral, nuevo uso del suelo.' },
    ],
    checklists: {
      pr: [
        { key: 'resolucion_publicada_do',     label: 'Resolución exenta SERVIU publicada en D.O.',
          extras: [
            { kind: 'texto', key: 'numero',    label: 'Número de resolución', placeholder: 'Ej. 99/2026', required: true },
            { kind: 'fecha', key: 'fecha_do',  label: 'Fecha publicación D.O.', required: true },
            { kind: 'doc',   key: 'resolucion', label: 'Resolución (PDF)', required: true },
          ],
        },
        { key: 'plazo_abandono_definido',     label: 'Plazo de abandono voluntario definido',
          extras: [
            { kind: 'fecha', key: 'fecha_limite', label: 'Fecha límite de abandono', required: true },
          ],
        },
        { key: 'informe_tecnico_poligono',    label: 'Informe técnico del polígono',
          extras: [
            { kind: 'doc',   key: 'informe', label: 'Informe técnico (PDF)', required: true },
            { kind: 'texto', key: 'autor',   label: 'Autor / unidad responsable', placeholder: 'SERVIU / SEREMI / otro' },
          ],
        },
        { key: 'costo_demolicion_presentado', label: 'SERVIU presentó costo y plazo de demolición',
          extras: [
            { kind: 'num',   key: 'monto_mm',     label: 'Costo estimado', unit: 'MM CLP', required: true },
            { kind: 'fecha', key: 'plazo_inicio', label: 'Plazo de inicio propuesto' },
            { kind: 'doc',   key: 'minuta',       label: 'Minuta de costo' },
          ],
        },
      ],
      f1: [
        { key: 'comite_caso_convocado',       label: 'Comité Caso convocado por DPR',
          descripcion: 'SERVIU regional + Carabineros + MDSF + Niñez + Salud + Migraciones + municipio.',
          extras: [
            { kind: 'fecha', key: 'fecha_convocatoria', label: 'Fecha de convocatoria', required: true },
            { kind: 'doc',   key: 'acta',                label: 'Acta de la sesión' },
          ],
        },
        { key: 'plan_operativo_carabineros',  label: 'Plan operativo de Carabineros levantado',
          extras: [
            { kind: 'doc', key: 'plan', label: 'Plan operativo (PDF)', required: true,
              hint: 'Documento elaborado por Carabineros con dispositivo del operativo.' },
          ],
        },
        { key: 'contingente_dimensionado',    label: 'Contingente dimensionado',
          extras: [
            { kind: 'num', key: 'efectivos', label: 'Efectivos comprometidos', unit: 'personas', required: true },
          ],
        },
        { key: 'refuerzos_comunicados',       label: 'Refuerzos de otras regiones comunicados con plazo de aviso',
          extras: [
            { kind: 'num', key: 'dias_aviso', label: 'Plazo de aviso', unit: 'días' },
          ],
        },
      ],
      f2: CHECKLIST_F2_BASE,
      f3: CHECKLIST_F3_BASE,
      f4: [
        { key: 'financiamiento_confirmado',   label: 'Financiamiento de demolición asegurado',
          descripcion: 'Regla de bloqueo: sin recursos confirmados no se autoriza el operativo.',
          extras: [
            { kind: 'num',   key: 'monto_mm',    label: 'Monto confirmado', unit: 'MM CLP', required: true },
            { kind: 'texto', key: 'fuente',      label: 'Fuente de recursos', placeholder: 'SERVIU / FNDR / Convenio / Provisión', required: true },
            { kind: 'doc',   key: 'validacion',  label: 'Documento de validación' },
          ],
        },
        { key: 'licitacion_demolicion_adjudicada', label: 'Licitación de demolición adjudicada',
          descripcion: 'Identificación de la licitación pública y adjudicatario.',
          extras: [
            { kind: 'texto', key: 'id_licitacion',       label: 'ID de licitación', placeholder: 'Ej. 1234-56-LE26', required: true },
            { kind: 'texto', key: 'oferente_adjudicado', label: 'Oferente adjudicado', required: true },
            { kind: 'doc',   key: 'plan_demolicion',     label: 'Plan de demolición', required: true,
              hint: 'Cronograma y metodología propuestos por el oferente.' },
            { kind: 'doc',   key: 'oferta_economica',    label: 'Oferta económica', required: true,
              hint: 'Documento con el monto adjudicado.' },
            { kind: 'doc',   key: 'adjudicacion',        label: 'Acta de adjudicación', required: true },
          ],
        },
        { key: 'residuos_peligrosos_coord',   label: 'Manejo de residuos peligrosos coordinado',
          descripcion: 'Asbesto y otros — SEREMI Salud + MMA.',
          extras: [
            { kind: 'doc', key: 'plan_residuos', label: 'Plan de manejo de residuos' },
          ],
        },
        { key: 'vertedero_autorizado',        label: 'Vertedero autorizado por MMA confirmado',
          extras: [
            { kind: 'texto', key: 'vertedero',   label: 'Vertedero / destino final' },
            { kind: 'doc',   key: 'autorizacion', label: 'Autorización MMA' },
          ],
        },
        { key: 'demolicion_simultanea',       label: 'Demolición simultánea al despeje (manzana a manzana)' },
      ],
      f5: CHECKLIST_F5_BASE,
    },
  },
  B: {
    label: 'Fiscal no-SERVIU',
    short: 'B',
    chip: { bg: 'bg-cyan-100', text: 'text-cyan-700', ring: 'ring-cyan-300' },
    financiamiento_default: 'Por convenio (Servicio / MINVU / FNDR / municipio)',
    rol_dpr: 'Conduce el operativo — ningún servicio habitacional es propietario.',
    nudo_critico: 'Coordinación propietario fiscal ↔ MINVU/SERVIU.',
    fases_aplicables: ['pr', 'f1', 'f2', 'f3', 'f4', 'f5'],
    roles: [
      { key: 'dpr',                  label: 'Delegada/o Presidencial Regional', required: true },
      { key: 'servicio_propietario', label: 'Servicio propietario del terreno', required: true,
        descripcion: 'BB.NN. / SAG / DIRECTEMAR / FF.AA. / otro. Resolución exenta + recursos.' },
      { key: 'minvu_serviu',         label: 'SEREMI MINVU + SERVIU regional', required: true,
        descripcion: 'Convenio de transferencia + acompañamiento técnico de demolición.' },
      { key: 'carabineros',          label: 'Jefatura de Carabineros (Zona/Prefectura)', required: true },
      { key: 'mideso',               label: 'SEREMI Desarrollo Social y Familia', required: true },
      { key: 'validacion_presupuestaria', label: 'Validación presupuestaria',
        descripcion: 'Confirmación de recursos por convenio o provisión. Definir caso a caso.' },
      { key: 'municipio',            label: 'Municipalidad',
        descripcion: 'Traspaso o concesión post-demolición si aplica.' },
    ],
    checklists: {
      pr: [
        { key: 'oficio_propietario_dpr',          label: 'Oficio del propietario a la DPR',
          descripcion: 'Servicio propietario solicita formalmente la intervención de la DPR.',
          extras: [
            { kind: 'fecha', key: 'fecha_oficio', label: 'Fecha del oficio', required: true },
            { kind: 'doc',   key: 'oficio',       label: 'Oficio (PDF)', required: true },
          ],
        },
        { key: 'resolucion_exenta_dpr',           label: 'Resolución Exenta de la DPR',
          descripcion: 'Acto administrativo de la DPR que autoriza el desalojo.',
          extras: [
            { kind: 'texto', key: 'numero',     label: 'Número de resolución', placeholder: 'Ej. 142/2026', required: true },
            { kind: 'fecha', key: 'fecha',      label: 'Fecha de la resolución', required: true },
            { kind: 'doc',   key: 'resolucion', label: 'Resolución (PDF)', required: true },
          ],
        },
        { key: 'resolucion_servicio_propietario', label: 'Resolución exenta del Servicio propietario',
          extras: [
            { kind: 'texto', key: 'servicio', label: 'Servicio propietario', placeholder: 'BB.NN. / SAG / DIRECTEMAR / FF.AA.', required: true },
            { kind: 'texto', key: 'numero',   label: 'Número de resolución', required: true },
            { kind: 'fecha', key: 'fecha',    label: 'Fecha de la resolución', required: true },
            { kind: 'doc',   key: 'resolucion', label: 'Resolución (PDF)', required: true },
          ],
        },
        { key: 'convenio_cooperacion',            label: 'Convenio Servicio – DPR – municipio firmado',
          extras: [
            { kind: 'fecha', key: 'fecha_firma', label: 'Fecha de firma', required: true },
            { kind: 'doc',   key: 'convenio',    label: 'Convenio (PDF)', required: true },
          ],
        },
        { key: 'financiador_definido',            label: 'Financiador de demolición definido',
          descripcion: 'Servicio / convenio MINVU-SERVIU / FNDR / municipio.',
          extras: [
            { kind: 'texto', key: 'financiador', label: 'Financiador', placeholder: 'Servicio / MINVU / FNDR / municipio', required: true },
          ],
        },
        { key: 'convenio_transferencia',          label: 'Convenio de transferencia firmado',
          descripcion: 'Antes de fijar fecha operativa.',
          extras: [
            { kind: 'fecha', key: 'fecha_firma', label: 'Fecha de firma', required: true },
            { kind: 'doc',   key: 'convenio',    label: 'Convenio (PDF)', required: true },
          ],
        },
      ],
      f1: [
        { key: 'comite_caso_convocado',       label: 'Comité Caso convocado por DPR',
          extras: [
            { kind: 'fecha', key: 'fecha_convocatoria', label: 'Fecha de convocatoria', required: true },
            { kind: 'doc',   key: 'acta',                label: 'Acta de la sesión' },
          ],
        },
        { key: 'plan_operativo_carabineros',  label: 'Plan operativo de Carabineros levantado',
          extras: [
            { kind: 'doc', key: 'plan', label: 'Plan operativo (PDF)', required: true },
          ],
        },
        { key: 'contingente_dimensionado',    label: 'Contingente dimensionado',
          extras: [
            { kind: 'num', key: 'efectivos', label: 'Efectivos comprometidos', unit: 'personas', required: true },
          ],
        },
        { key: 'convenio_demolicion_activo',  label: 'Convenio operativo de demolición activado',
          descripcion: 'Convenio vigente del Servicio o licitación adjudicada.',
          extras: [
            { kind: 'doc',   key: 'convenio_o_licitacion', label: 'Convenio / acta de licitación' },
            { kind: 'fecha', key: 'fecha_vigencia',         label: 'Fecha de vigencia' },
          ],
        },
      ],
      f2: CHECKLIST_F2_BASE,
      f3: CHECKLIST_F3_BASE,
      f4: [
        { key: 'financiamiento_confirmado',   label: 'Financiamiento de demolición asegurado',
          extras: [
            { kind: 'num',   key: 'monto_mm', label: 'Monto confirmado', unit: 'MM CLP', required: true },
            { kind: 'texto', key: 'fuente',   label: 'Fuente de recursos', required: true,
              placeholder: 'Servicio / Convenio MINVU / FNDR / Municipal / Provisión' },
            { kind: 'doc',   key: 'validacion', label: 'Documento de validación' },
          ],
        },
        { key: 'licitacion_demolicion_adjudicada', label: 'Licitación de demolición adjudicada',
          descripcion: 'Identificación de la licitación pública y adjudicatario.',
          extras: [
            { kind: 'texto', key: 'id_licitacion',       label: 'ID de licitación', placeholder: 'Ej. 1234-56-LE26', required: true },
            { kind: 'texto', key: 'oferente_adjudicado', label: 'Oferente adjudicado', required: true },
            { kind: 'doc',   key: 'plan_demolicion',     label: 'Plan de demolición', required: true,
              hint: 'Cronograma y metodología propuestos por el oferente.' },
            { kind: 'doc',   key: 'oferta_economica',    label: 'Oferta económica', required: true,
              hint: 'Documento con el monto adjudicado.' },
            { kind: 'doc',   key: 'adjudicacion',        label: 'Acta de adjudicación', required: true },
          ],
        },
        { key: 'residuos_peligrosos_coord',   label: 'Manejo de residuos peligrosos coordinado',
          extras: [
            { kind: 'doc', key: 'plan_residuos', label: 'Plan de manejo de residuos' },
          ],
        },
        { key: 'vertedero_autorizado',        label: 'Vertedero autorizado por MMA confirmado',
          extras: [
            { kind: 'texto', key: 'vertedero',   label: 'Vertedero / destino final' },
            { kind: 'doc',   key: 'autorizacion', label: 'Autorización MMA' },
          ],
        },
        { key: 'demolicion_simultanea',       label: 'Demolición simultánea al despeje' },
      ],
      f5: [
        ...CHECKLIST_F5_BASE,
        { key: 'traspaso_o_concesion_evaluado', label: 'Traspaso o concesión del terreno al municipio evaluado',
          descripcion: 'Modelo Armada – La Chimba si aplica.',
          extras: [
            { kind: 'texto', key: 'modalidad',  label: 'Modalidad', placeholder: 'Traspaso / concesión / convenio de uso' },
            { kind: 'doc',   key: 'evaluacion', label: 'Documento de evaluación' },
          ],
        },
      ],
    },
  },
  C: {
    label: 'Privado con fallo firme',
    short: 'C',
    chip: { bg: 'bg-violet-100', text: 'text-violet-700', ring: 'ring-violet-300' },
    financiamiento_default: 'Propietario privado (o convenio público supletorio)',
    rol_dpr: 'Materializa lo ordenado por el tribunal.',
    nudo_critico: 'Magnitud y conflictividad — plan plurianual, no operativo puntual.',
    // C no usa F4 — la demolición la asume el propietario privado, sin validación pública de recursos.
    fases_aplicables: ['pr', 'f1', 'f2', 'f3', 'f5'],
    roles: [
      { key: 'dpr',              label: 'Delegada/o Presidencial Regional', required: true,
        descripcion: 'Materializa lo ordenado por el tribunal.' },
      { key: 'propietario',      label: 'Propietario privado', required: true,
        descripcion: 'Asume seguridad, cierre, demolición y recuperación.' },
      { key: 'tribunal',         label: 'Tribunal con la causa', required: true,
        descripcion: 'Ejecución de sentencia con auxilio de fuerza pública.' },
      { key: 'carabineros',      label: 'Jefatura de Carabineros (Zona/Prefectura)', required: true,
        descripcion: 'Resguardo permanente durante la desocupación gradual.' },
      { key: 'mideso',           label: 'SEREMI Desarrollo Social y Familia', required: true },
      { key: 'minvu_subsidios',  label: 'SEREMI MINVU — subsidios habitacionales',
        descripcion: 'Mensaje único al territorio: oferta vinculada al proyecto técnico.' },
      { key: 'municipio',        label: 'Municipalidad' },
    ],
    checklists: {
      pr: [
        { key: 'sentencia_firme',             label: 'Sentencia o resolución judicial firme',
          extras: [
            { kind: 'texto', key: 'rol_causa', label: 'Rol de la causa', placeholder: 'Ej. C-1234-2023', required: true },
            { kind: 'texto', key: 'tribunal',  label: 'Tribunal', placeholder: 'Ej. Corte Suprema', required: true },
            { kind: 'fecha', key: 'fecha',     label: 'Fecha de la sentencia', required: true },
            { kind: 'doc',   key: 'sentencia', label: 'Sentencia (PDF)', required: true },
          ],
        },
        { key: 'propietario_identificado',    label: 'Propietario identificado',
          extras: [
            { kind: 'texto', key: 'nombre', label: 'Nombre / razón social', required: true },
            { kind: 'texto', key: 'rut',    label: 'RUT' },
          ],
        },
        { key: 'deslindes_verificados',       label: 'Deslindes verificados',
          extras: [
            { kind: 'doc', key: 'plano', label: 'Plano de deslindes' },
          ],
        },
        { key: 'rol_propietario_definido',    label: 'Rol del propietario definido',
          descripcion: 'Seguridad, cierre perimetral, demolición, recuperación.',
          extras: [
            { kind: 'texto', key: 'compromiso', label: 'Qué asume el propietario',
              placeholder: 'Seguridad / cierre / demolición / recuperación', required: true },
          ],
        },
        { key: 'plan_maestro_articulado',     label: 'Plan Maestro / cooperativas articulados (si aplica)',
          extras: [
            { kind: 'doc', key: 'plan', label: 'Plan Maestro / convenio cooperativa' },
          ],
        },
      ],
      f1: [
        { key: 'plan_resguardo_permanente',   label: 'Plan de resguardo permanente levantado',
          descripcion: 'F1 en Tipo C suele requerir resguardo durante toda la desocupación gradual.',
          extras: [
            { kind: 'doc', key: 'plan', label: 'Plan de resguardo (PDF)', required: true },
          ],
        },
        { key: 'contingente_dimensionado',    label: 'Contingente reforzado dimensionado',
          extras: [
            { kind: 'num', key: 'efectivos', label: 'Efectivos comprometidos', unit: 'personas', required: true },
          ],
        },
        { key: 'estrategia_cuadrantes',       label: 'Estrategia de desocupación gradual por cuadrantes definida',
          extras: [
            { kind: 'doc', key: 'mapa', label: 'Mapa de cuadrantes / cronograma', required: true },
          ],
        },
      ],
      f2: CHECKLIST_F2_BASE,
      f3: [
        ...CHECKLIST_F3_BASE,
        { key: 'mensaje_subsidios_unico',     label: 'Mensaje único sobre subsidios al territorio',
          descripcion: 'Oferta habitacional vinculada al proyecto técnico, no a la presión.',
          extras: [
            { kind: 'texto', key: 'mensaje',    label: 'Mensaje aprobado',
              placeholder: 'Texto literal del mensaje vocero único.', required: true },
            { kind: 'fecha', key: 'fecha_aprobacion', label: 'Fecha de aprobación' },
          ],
        },
      ],
      f4: [
        { key: 'demolicion_propietario_o_convenio', label: 'Demolición asumida por propietario o por convenio público' },
        { key: 'financiamiento_publico_validado',   label: 'Si financia el Estado: validación de recursos' },
        { key: 'residuos_peligrosos_coord',         label: 'Manejo de residuos peligrosos coordinado' },
        { key: 'demolicion_simultanea',             label: 'Demolición simultánea al despeje' },
      ],
      f5: [
        ...CHECKLIST_F5_BASE,
        { key: 'regeneracion_urbana_integrada',     label: 'Proyecto de regeneración urbana integrado (si aplica)',
          descripcion: 'Centinela: Plan Maestro de ~9.800 viviendas.',
          extras: [
            { kind: 'doc', key: 'proyecto', label: 'Proyecto de regeneración (PDF)' },
          ],
        },
      ],
    },
  },
  D: {
    label: 'Privado sin solución judicial',
    short: 'D',
    chip: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-300' },
    financiamiento_default: 'Municipio o propietario',
    rol_dpr: 'No puede desalojar; articula la vía jurídica.',
    nudo_critico: 'Definición previa de la vía jurídica — máximo 30 días.',
    // D sólo tiene PR mientras se decide la vía. Al resolverla, la capa pasa a
    // tipología B (Ley 21.633 / Art. 157 LGUC) o C (expropiación con sentencia),
    // según el camino elegido. Las demás fases entonces se "activan" solas.
    fases_aplicables: ['pr'],
    roles: [
      { key: 'dpr',              label: 'Delegada/o Presidencial Regional', required: true,
        descripcion: 'Articula la vía jurídica con los actores relevantes.' },
      { key: 'subsecretaria_juridica', label: 'Subsecretaría del Interior — División Jurídica', required: true,
        descripcion: 'Define la vía jurídica aplicable.' },
      { key: 'municipio',        label: 'Alcaldía (Art. 148/157 LGUC)',
        descripcion: 'Si la vía elegida es orden de demolición municipal.' },
      { key: 'ministerio_publico', label: 'Ministerio Público',
        descripcion: 'Si la vía elegida es Ley 21.633 (usurpación + cautelar).' },
      { key: 'propietario',      label: 'Propietario privado',
        descripcion: 'Si la vía elegida pasa por querella del propietario.' },
    ],
    checklists: {
      pr: [
        { key: 'via_juridica_decidida',       label: 'Vía jurídica decidida',
          descripcion: 'Art. 148/157 LGUC (riesgo) / Ley 21.633 (querella + cautelar) / Expropiación. Plazo máx. 30 días.',
          extras: [
            { kind: 'texto', key: 'via',          label: 'Vía elegida', required: true,
              placeholder: 'Art. 148 LGUC / Art. 157 LGUC / Ley 21.633 / Expropiación' },
            { kind: 'fecha', key: 'fecha_decision', label: 'Fecha de decisión', required: true },
          ],
        },
        { key: 'expediente_tecnico_social',   label: 'Expediente técnico-social levantado',
          extras: [
            { kind: 'doc', key: 'expediente', label: 'Expediente técnico-social', required: true },
          ],
        },
        { key: 'instrumento_ingresado',       label: 'Instrumento ingresado',
          descripcion: 'Querella, denuncia, oficio o decreto presentado.',
          extras: [
            { kind: 'texto', key: 'tipo',         label: 'Tipo de instrumento', required: true,
              placeholder: 'Querella / denuncia / oficio / decreto' },
            { kind: 'fecha', key: 'fecha_ingreso', label: 'Fecha de ingreso', required: true },
            { kind: 'doc',   key: 'instrumento',   label: 'Instrumento ingresado (PDF)' },
          ],
        },
        { key: 'ministerio_publico_coord',    label: 'Ministerio Público coordinado (si Ley 21.633)',
          extras: [
            { kind: 'texto', key: 'contacto',  label: 'Fiscal / unidad de contacto' },
            { kind: 'fecha', key: 'fecha_oficio', label: 'Fecha del oficio' },
          ],
        },
      ],
      f1: [
        { key: 'plan_operativo_post_via',     label: 'Plan operativo de Carabineros (post-vía resuelta)',
          descripcion: 'Carabineros no levanta plan sin vía resuelta.' },
        { key: 'contingente_dimensionado',    label: 'Contingente dimensionado' },
      ],
      f2: CHECKLIST_F2_BASE,
      f3: CHECKLIST_F3_BASE,
      f4: [
        { key: 'demolicion_financiada',       label: 'Demolición financiada',
          descripcion: 'Municipio (modelo Villa Lautaro) o propietario.' },
        { key: 'residuos_peligrosos_coord',   label: 'Manejo de residuos peligrosos coordinado' },
        { key: 'demolicion_simultanea',       label: 'Demolición simultánea al despeje' },
      ],
      f5: CHECKLIST_F5_BASE,
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Fases aplicables por tipología
// ─────────────────────────────────────────────────────────────────────────

/**
 * Devuelve las fases vigentes (con semáforo) de una capa según su tipología.
 * Si la capa todavía no tiene tipología asignada, retorna las 6 fases por
 * defecto — el caso degenerado de "lista plana" antes de catalogar.
 */
export function getFasesAplicables(
  tipologia: DesalojoTipologia | null,
): DesalojoFaseConSemaforo[] {
  if (!tipologia) return FASES_CON_SEMAFORO
  return TIPOLOGIA_CFG[tipologia].fases_aplicables
}

/** Atajo booleano: ¿esta capa usa esta fase? */
export function aplicaFase(
  capa: { tipologia: DesalojoTipologia | null },
  fase: DesalojoFaseConSemaforo,
): boolean {
  if (!capa.tipologia) return true
  return TIPOLOGIA_CFG[capa.tipologia].fases_aplicables.includes(fase)
}

/** Roles vigentes para esta capa según su tipología. Vacío si no hay tipología. */
export function getRoles(tipologia: DesalojoTipologia | null): RolCfg[] {
  if (!tipologia) return []
  return TIPOLOGIA_CFG[tipologia].roles
}

/**
 * Fase siguiente APLICABLE para la capa (no la fase siguiente del orden global).
 * Esto importa para Tipo C: la fase siguiente a F3 es F5 (no F4). Para Tipo D:
 * no hay siguiente (sólo PR — al avanzar la capa debe cambiar de tipología).
 */
export function nextFaseAplicable(
  actual:    DesalojoFase,
  tipologia: DesalojoTipologia | null,
): DesalojoFase | null {
  if (actual === 'cerrado') return null
  const aplicables = getFasesAplicables(tipologia)
  if (actual === 'pr') {
    return aplicables[1] ?? null
  }
  const idx = aplicables.indexOf(actual as DesalojoFaseConSemaforo)
  if (idx < 0) {
    // La capa está en una fase que ya no aplica (cambio reciente de tipología).
    // Devolvemos la primera aplicable estrictamente posterior por orden global.
    const globalIdx = FASE_ORDEN.indexOf(actual)
    const siguiente = aplicables.find(f => FASE_ORDEN.indexOf(f) > globalIdx)
    return siguiente ?? 'cerrado'
  }
  if (idx >= aplicables.length - 1) return 'cerrado'
  return aplicables[idx + 1]
}

/** Fase anterior APLICABLE para la capa. */
export function prevFaseAplicable(
  actual:    DesalojoFase,
  tipologia: DesalojoTipologia | null,
): DesalojoFase | null {
  const aplicables = getFasesAplicables(tipologia)
  if (actual === 'cerrado') return aplicables[aplicables.length - 1] ?? null
  const idx = aplicables.indexOf(actual as DesalojoFaseConSemaforo)
  if (idx > 0) return aplicables[idx - 1]
  if (idx === 0) return null
  // Fase actual fuera de aplicables — buscar la aplicable previa por orden global.
  const globalIdx = FASE_ORDEN.indexOf(actual)
  const candidatas = aplicables.filter(f => FASE_ORDEN.indexOf(f) < globalIdx)
  return candidatas[candidatas.length - 1] ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// Bloqueo de avance de fase
// ─────────────────────────────────────────────────────────────────────────
// Solo PR → F1 está bloqueado por regla dura. Requiere:
//   - semáforo PR en verde
//   - todos los items obligatorios del checklist PR completos
// Las demás transiciones quedan libres (con warning si la fase actual no es verde).
// Sin override (decisión Mesa).

export type AdvanceCheck = { ok: boolean; reasons: string[] }

/**
 * Un item del checklist se considera "completo" si:
 *   1. Su bool `done` está marcado, Y
 *   2. Todos sus extras `required` tienen valor no vacío.
 *
 * Para extras `kind: 'doc'`, el valor "no vacío" se verifica contra la lista
 * de documentos vinculados (pasada por separado) — el JSONB no guarda los doc
 * ids, los docs viven en desalojo_documentos con fase + item_key.
 */
export function itemDone(
  item:           ChecklistItem,
  itemEstado:     DesalojoChecklistItemEstado | undefined,
  itemDocsCount:  number = 0,
): boolean {
  if (!itemEstado?.done) return false
  if (!item.extras || item.extras.length === 0) return true
  for (const extra of item.extras) {
    if (!extra.required) continue
    if (extra.kind === 'doc') {
      if (itemDocsCount === 0) return false
      continue
    }
    const v = itemEstado.extras?.[extra.key]
    if (v === undefined || v === null) return false
    if (typeof v === 'string' && v.trim() === '') return false
  }
  return true
}

export function canAdvanceFase(
  capa:        DesalojoCapa,
  fasesEstado: DesalojoFaseEstado[],
  destino:     DesalojoFase,
  /** docs ya filtrados a esta capa. Si se omiten, los extras DOC required no se chequean. */
  docs:        Array<{ capa_id: number | null; fase: DesalojoFaseConSemaforo | null; item_key: string | null }> = [],
): AdvanceCheck {
  const reasons: string[] = []

  // Validar que el destino aplique a la tipología (ej.: F4 en Tipo C bloqueado).
  if (destino !== 'cerrado' && capa.tipologia) {
    if (!aplicaFase(capa, destino as DesalojoFaseConSemaforo)) {
      reasons.push(`La fase ${destino.toUpperCase()} no aplica a la tipología ${capa.tipologia}.`)
    }
  }

  if (capa.fase_actual === 'pr' && destino === 'f1') {
    const pr = fasesEstado.find(f => f.fase === 'pr')
    if (!pr || pr.semaforo !== 'verde') {
      reasons.push('El semáforo de PR debe estar verde.')
    }
    if (capa.tipologia) {
      const itemsPR = TIPOLOGIA_CFG[capa.tipologia].checklists.pr
      const estado  = pr?.checklist_estado ?? {}
      const faltan  = itemsPR.filter(it => {
        const docsItem = docs.filter(d => d.capa_id === capa.id && d.fase === 'pr' && d.item_key === it.key).length
        return !itemDone(it, estado[it.key], docsItem)
      })
      if (faltan.length > 0) {
        reasons.push(`Quedan ${faltan.length} item(s) del checklist PR sin completar.`)
      }
    } else {
      reasons.push('La capa no tiene tipología asignada.')
    }
  }

  return { ok: reasons.length === 0, reasons }
}

export function nextFase(actual: DesalojoFase): DesalojoFase | null {
  const idx = FASE_ORDEN.indexOf(actual)
  if (idx < 0 || idx >= FASE_ORDEN.length - 1) return null
  return FASE_ORDEN[idx + 1]
}

export function prevFase(actual: DesalojoFase): DesalojoFase | null {
  const idx = FASE_ORDEN.indexOf(actual)
  if (idx <= 0) return null
  return FASE_ORDEN[idx - 1]
}

// ─────────────────────────────────────────────────────────────────────────
// Rollup del caso desde sus capas — peor por severidad de atención
// ─────────────────────────────────────────────────────────────────────────

export const SEV_ORDER: Record<SemaforoDimension, number> = {
  rojo:  3,
  ambar: 2,
  gris:  1,
  verde: 0,
}

export function rollupSemaforoFase(
  fasesEstado: DesalojoFaseEstado[],
  capaIds:     Set<number>,           // ids de capas activas
  fase:        DesalojoFaseConSemaforo,
): SemaforoDimension {
  const relevantes = fasesEstado.filter(e => capaIds.has(e.capa_id) && e.fase === fase)
  if (relevantes.length === 0) return 'gris'
  return relevantes.reduce<SemaforoDimension>((peor, e) => {
    return SEV_ORDER[e.semaforo] > SEV_ORDER[peor] ? e.semaforo : peor
  }, 'verde')
}

export function rollupFaseActual(capas: DesalojoCapa[]): DesalojoFase {
  const activas = capas.filter(c => c.activa)
  if (activas.length === 0) return 'pr'
  return activas.reduce<DesalojoFase>((mas_rezagada, c) => {
    return FASE_ORDEN.indexOf(c.fase_actual) < FASE_ORDEN.indexOf(mas_rezagada)
      ? c.fase_actual
      : mas_rezagada
  }, 'cerrado')
}

// ─────────────────────────────────────────────────────────────────────────
// Banner Tipo D >30 días sin vía
// ─────────────────────────────────────────────────────────────────────────

export function diasDesdeTipologia(capa: DesalojoCapa): number | null {
  if (!capa.tipologia_asignada_at) return null
  const t = new Date(capa.tipologia_asignada_at).getTime()
  if (isNaN(t)) return null
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24))
}

export function tipoDSinVia(capa: DesalojoCapa): boolean {
  if (capa.tipologia !== 'D') return false
  return capa.via_juridica == null || capa.via_juridica.trim() === ''
}

// ─────────────────────────────────────────────────────────────────────────
// MATRIZ JURÍDICA (Sección VI del 038)
// ─────────────────────────────────────────────────────────────────────────
// Propiedad × situación → instrumento aplicable + referencia documental.

export type PropiedadTerreno =
  | 'fiscal_serviu'
  | 'fiscal_bbnn'
  | 'fiscal_ffaa'
  | 'privado_sentencia'
  | 'privado_riesgo'
  | 'privado_propietario_activo'
  | 'privado_propietario_ausente'

export const MATRIZ_JURIDICA: {
  key:         PropiedadTerreno
  propiedad:   string
  situacion:   string
  instrumento: string
  referencia:  string
  tipologia:   DesalojoTipologia
}[] = [
  { key: 'fiscal_serviu',              propiedad: 'Fiscal SERVIU',
    situacion: 'Toma sobre bien fiscal habitacional administrado por SERVIU',
    instrumento: 'Resolución administrativa de desalojo SERVIU',
    referencia:  'Resolución Exenta 99/2026 (Cerro Chuño)',
    tipologia: 'A' },
  { key: 'fiscal_bbnn',                propiedad: 'Fiscal Bienes Nacionales',
    situacion: 'Ocupación irregular en bien fiscal administrado por BB.NN.',
    instrumento: 'Resolución de desalojo del SEREMI BB.NN.',
    referencia:  'Resolución 274/2023 (La Chimba)',
    tipologia: 'B' },
  { key: 'fiscal_ffaa',                propiedad: 'Fiscal Armada / FF.AA.',
    situacion: 'Ocupación en bien fiscal afectado a una rama de las FF.AA.',
    instrumento: 'Resolución del Servicio respectivo',
    referencia:  'Resolución 139/2026 (La Chimba, polígono Armada)',
    tipologia: 'B' },
  { key: 'privado_sentencia',          propiedad: 'Privado con sentencia firme',
    situacion: 'Recurso de protección acogido o sentencia ejecutoriada',
    instrumento: 'Ejecución de sentencia con auxilio de la fuerza pública',
    referencia:  'Sentencia Corte Suprema 23-jun-2023 (Centinela)',
    tipologia: 'C' },
  { key: 'privado_riesgo',             propiedad: 'Privado sin sentencia, riesgo sanitario',
    situacion: 'Asentamiento que constituye riesgo sanitario o estructural acreditado',
    instrumento: 'Orden de demolición del Alcalde, previo informe del DOM',
    referencia:  'Art. 157 LGUC (Villa Lautaro)',
    tipologia: 'D' },
  { key: 'privado_propietario_activo', propiedad: 'Privado sin sentencia, propietario activo',
    situacion: 'Propietario dispuesto a accionar por usurpación',
    instrumento: 'Querella o denuncia por usurpación + desalojo cautelar Ley 21.633',
    referencia:  'Ley de Usurpaciones (Punta de Parra)',
    tipologia: 'D' },
  { key: 'privado_propietario_ausente', propiedad: 'Privado sin sentencia, propietario ausente',
    situacion: 'Propietario sin disposición o no ubicable, terreno con destino de utilidad pública',
    instrumento: 'Expropiación por causa de utilidad pública',
    referencia:  'Decreto Exento N°88 / 2025 (Centinela)',
    tipologia: 'D' },
]

// Sugiere instrumento jurídico aplicable según la tipología de la capa.
export function sugerenciasInstrumento(tipologia: DesalojoTipologia | null) {
  if (!tipologia) return []
  return MATRIZ_JURIDICA.filter(m => m.tipologia === tipologia)
}

// ─────────────────────────────────────────────────────────────────────────
// PROTOCOLO DE ASEGURAMIENTO DE FINANCIAMIENTO (Sección VII del 038)
// ─────────────────────────────────────────────────────────────────────────
// Árbol de decisión genérico. Ningún caso debe activar Fase 3 sin
// financiamiento de demolición asegurado. El estado final ("recursos
// confirmados") es un flag operativo: deliberadamente no se nombra al
// ente validador específico para no comprometer a un ministerio puntual
// desde la UI (cada caso lo resuelve la Sala Decisión).

type AlternativaFinanciamiento = { key: string; label: string; detalle?: string }

export const PROTOCOLO_FINANCIAMIENTO: {
  fuente_primaria: Record<'serviu' | 'otro_servicio' | 'privado', { label: string; detalle: string }>
  alternativas:    AlternativaFinanciamiento[]
  estado_final:    { label: string; detalle: string }
} = {
  fuente_primaria: {
    serviu:       { label: 'SERVIU', detalle: 'Con cargo al presupuesto habitacional regional.' },
    otro_servicio:{ label: 'Otro Servicio o SEREMI', detalle: 'Capacidad presupuestaria del propietario fiscal.' },
    privado:      { label: 'Privado', detalle: 'Cargo del propietario privado, como regla general.' },
  },
  alternativas: [
    { key: 'convenio_minvu',     label: 'Convenio de traspaso de recursos MINVU al Servicio propietario' },
    { key: 'fndr_gore',          label: 'FNDR del Gobierno Regional' },
    { key: 'municipal',          label: 'Presupuesto municipal con apoyo técnico del SERVIU' },
    { key: 'extraordinaria',     label: 'Provisión extraordinaria de la Subsecretaría del Interior',
      detalle: 'Sólo casos calificados por Sala Decisión.' },
  ],
  estado_final: {
    label: 'Recursos confirmados en Sala Decisión',
    detalle: 'Financiamiento ASEGURADO — sólo entonces se autoriza el inicio del operativo.',
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers UI varios
// ─────────────────────────────────────────────────────────────────────────

import type { DesalojoDimension } from '@/lib/types'
export const DIMENSION_LABEL: Record<DesalojoDimension, string> = {
  juridico:       'Jurídico',
  seguridad:      'Seguridad',
  social:         'Social',
  financiamiento: 'Financiamiento',
}

// Items vigentes del checklist para una capa según tipología y fase.
export function checklistItems(
  tipologia: DesalojoTipologia | null,
  fase:      DesalojoFaseConSemaforo,
): ChecklistItem[] {
  if (!tipologia) return []
  return TIPOLOGIA_CFG[tipologia].checklists[fase] ?? []
}

// Progreso del checklist (completos / total) — usado por la UI para badges.
// Si se pasa `docsCountByItem`, el progreso honra los extras DOC required
// (un item con DOC required sin docs no cuenta como completo). Sin
// docsCountByItem, el conteo es por bool + extras no-DOC required.
export function checklistProgreso(
  tipologia: DesalojoTipologia | null,
  fase:      DesalojoFaseConSemaforo,
  estado:    DesalojoChecklistEstado | null | undefined,
  docsCountByItem?: Record<string, number>,
): { completos: number; total: number } {
  const items = checklistItems(tipologia, fase)
  const total = items.length
  if (total === 0) return { completos: 0, total: 0 }
  const completos = items.filter(it => {
    const docsCount = docsCountByItem?.[it.key] ?? 0
    return itemDone(it, estado?.[it.key], docsCount)
  }).length
  return { completos, total }
}

// ─────────────────────────────────────────────────────────────────────────
// Planificación — estado calculado de eventos del timeline
// ─────────────────────────────────────────────────────────────────────────

/**
 * Estado de un evento del timeline de Planificación, derivado de su fecha
 * de inicio y fin opcional vs hoy.
 *
 *   hoyISO < fecha_inicio              → 'planificado'
 *   fecha_inicio ≤ hoyISO ≤ fecha_fin  → 'en_curso'
 *   hoyISO > fecha_fin                 → 'hecho'
 *
 * Para evento puntual (`fecha_fin === null`), fin = fecha_inicio.
 *
 * Comparación con strings YYYY-MM-DD para evitar drift de zona horaria.
 * Usar `new Date()` aquí daría estados distintos según TZ del browser:
 * un user con TZ=UTC vería "hoy" desplazado vs uno con TZ=America/Santiago.
 * `toLocaleDateString('sv-SE')` devuelve formato ISO en la TZ local sin parsear.
 */
import type { DesalojoPlanificacion, DesalojoPlanificacionEstado } from '@/lib/types'

export function estadoEventoPlanificacion(
  e:       Pick<DesalojoPlanificacion, 'fecha_inicio' | 'fecha_fin'>,
  hoyISO:  string = new Date().toLocaleDateString('sv-SE'),  // 'sv-SE' = YYYY-MM-DD en TZ local
): DesalojoPlanificacionEstado {
  const fin = e.fecha_fin ?? e.fecha_inicio
  if (hoyISO > fin)            return 'hecho'
  if (hoyISO < e.fecha_inicio) return 'planificado'
  return 'en_curso'
}

// ─────────────────────────────────────────────────────────────────────────
// Paleta de colores por capa
// ─────────────────────────────────────────────────────────────────────────
// Distinta de la paleta de tipología (indigo/cyan/violet/orange) y distinta
// del set de semáforos. Pensada para el drawer de calendario donde cada capa
// pinta sus hitos con un color propio. Cicla en módulo si hay más de 6 capas.

export type CapaColor = {
  /** Texto para chips/labels. */
  text:    string
  /** Background tenue para chips/labels. */
  bg:      string
  /** Ring tenue para chips. */
  ring:    string
  /** Background sólido (dots/eventos). */
  dotBg:   string
  /** Hex aproximado, para SVG/legend si se necesita raw color. */
  hex:     string
}

const CAPA_PALETA: CapaColor[] = [
  { text: 'text-blue-700',    bg: 'bg-blue-50',    ring: 'ring-blue-300',    dotBg: 'bg-blue-500',    hex: '#3b82f6' },
  { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-300', dotBg: 'bg-emerald-500', hex: '#10b981' },
  { text: 'text-rose-700',    bg: 'bg-rose-50',    ring: 'ring-rose-300',    dotBg: 'bg-rose-500',    hex: '#f43f5e' },
  { text: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-300',   dotBg: 'bg-amber-500',   hex: '#f59e0b' },
  { text: 'text-teal-700',    bg: 'bg-teal-50',    ring: 'ring-teal-300',    dotBg: 'bg-teal-500',    hex: '#14b8a6' },
  { text: 'text-fuchsia-700', bg: 'bg-fuchsia-50', ring: 'ring-fuchsia-300', dotBg: 'bg-fuchsia-500', hex: '#d946ef' },
]

/** Color asociado a una capa según su `orden`. Cicla si supera la paleta. */
export function getCapaColor(orden: number): CapaColor {
  const idx = ((orden % CAPA_PALETA.length) + CAPA_PALETA.length) % CAPA_PALETA.length
  return CAPA_PALETA[idx]
}
