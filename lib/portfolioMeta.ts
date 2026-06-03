/**
 * Catálogos canónicos de estados (SEIA) y etapas (MOP) con definición e
 * implicancia para tooltips y orden lógico de columnas en la vista kanban.
 *
 * Fuentes oficiales (verificadas):
 *  - SEIA: sea.gob.cl, Ley 19.300, Reglamento DS 40/2012,
 *    Instructivo de Procedimientos Administrativos SEA 2025, SIG SEA.
 *  - MOP/SNI: sni.gob.cl, mop.gob.cl/proyectos.mop.gob.cl, dipres.gob.cl.
 *
 * Cada item: orden lifecycle (1 = entrada del pipeline), definición ultra-breve
 * (qué significa estar ahí), implicancia (qué nos dice para el seguimiento) y
 * alternativas léxicas para que el matcher tolere lo que llega del scraping.
 */

export type PipelineMeta = {
  canonical:    string
  orden:        number
  definicion:   string
  implicancia:  string
  alternativas: readonly string[]
}

// ── SEIA — Sistema de Evaluación de Impacto Ambiental ────────────────────────

export const SEIA_PIPELINE: readonly PipelineMeta[] = [
  {
    canonical:    'En Admisión',
    orden:        1,
    definicion:   'El SEA revisa si la DIA/EIA cumple requisitos formales mínimos para entrar a evaluación.',
    implicancia:  'Tránsito breve; resolución del servicio en pocos días.',
    alternativas: ['Admisibilidad', 'En Revisión de Admisibilidad', 'Pendiente Admisibilidad'],
  },
  {
    canonical:    'En Calificación',
    orden:        2,
    definicion:   'Proyecto admitido; servicios públicos analizan impactos y emiten observaciones (ICSARA/Adenda).',
    implicancia:  'Tránsito largo; titular debe responder adendas en plazo.',
    alternativas: ['En Evaluación', 'En Tramitación', 'Calificación'],
  },
  {
    canonical:    'Aprobado',
    orden:        3,
    definicion:   'Recibió Resolución de Calificación Ambiental favorable; queda autorizado a ejecutarse.',
    implicancia:  'Terminal favorable; titular tiene 5 años para iniciar obras.',
    alternativas: ['RCA Favorable', 'Calificado Favorablemente'],
  },
  {
    canonical:    'Rechazado',
    orden:        4,
    definicion:   'Recibió RCA desfavorable; no puede ejecutarse como fue presentado.',
    implicancia:  'Terminal desfavorable; titular puede reclamar o reformular.',
    alternativas: ['RCA Desfavorable', 'Calificado Desfavorablemente'],
  },
  {
    canonical:    'Desistido',
    orden:        5,
    definicion:   'El titular pidió formalmente retirar el proyecto antes de la calificación final.',
    implicancia:  'Terminal por decisión del titular; no hay RCA.',
    alternativas: ['Desistimiento'],
  },
  {
    canonical:    'No Calificado',
    orden:        6,
    definicion:   'Proceso terminó sin pronunciamiento de fondo, normalmente por falta de respuesta del titular.',
    implicancia:  'Terminal sin RCA; suele gatillarse por silencio o vencimiento.',
    alternativas: [],
  },
  {
    canonical:    'No Admitido a Tramitación',
    orden:        7,
    definicion:   'El SEA resolvió que el expediente no cumple requisitos formales y no entra a evaluación.',
    implicancia:  'Terminal de entrada; titular puede corregir y reingresar.',
    alternativas: ['Inadmisible', 'No Admitido'],
  },
  {
    canonical:    'Revocado',
    orden:        8,
    definicion:   'RCA otorgada fue dejada sin efecto, normalmente por caducidad a los 5 años sin obras.',
    implicancia:  'Post-RCA; titular pierde habilitación ambiental.',
    alternativas: ['RCA Revocada', 'Caducado'],
  },
  {
    canonical:    'Abandonado',
    orden:        9,
    definicion:   'Titular activó cierre o abandono de instalaciones ya evaluadas como fase de operación.',
    implicancia:  'Post-RCA; aplica plan de cierre y seguimiento.',
    alternativas: [],
  },
]

// ── MOP — Ciclo de inversión SNI ─────────────────────────────────────────────

export const MOP_PIPELINE: readonly PipelineMeta[] = [
  {
    canonical:    'Idea',
    orden:        1,
    definicion:   'Se identifica un problema u oportunidad pública sin desarrollo técnico aún.',
    implicancia:  'Incipiente; sin desembolsos ni avance físico.',
    alternativas: [],
  },
  {
    canonical:    'Perfil',
    orden:        2,
    definicion:   'Evaluación preliminar técnica, de mercado y económica de la iniciativa.',
    implicancia:  'Preinversión; sin obras.',
    alternativas: [],
  },
  {
    canonical:    'Prefactibilidad',
    orden:        3,
    definicion:   'Se analizan en detalle las alternativas viables y se selecciona la más conveniente.',
    implicancia:  'Estudio; sin obras ni desembolso relevante.',
    alternativas: [],
  },
  {
    canonical:    'Factibilidad',
    orden:        4,
    definicion:   'Se perfecciona la alternativa elegida midiendo costos y beneficios con mayor precisión.',
    implicancia:  'Estudio avanzado; aún sin construcción.',
    alternativas: [],
  },
  {
    canonical:    'Diseño',
    orden:        5,
    definicion:   'Se elaboran estudios de ingeniería, planos y especificaciones técnicas de la obra.',
    implicancia:  'Pre-obra; entregables son documentos técnicos.',
    alternativas: ['Estudios de Diseño', 'Diseno'],
  },
  {
    canonical:    'Ejecución',
    orden:        6,
    definicion:   'Se construye la infraestructura o se adquiere el equipamiento del proyecto.',
    implicancia:  'Hay avance físico y financiero a reportar mes a mes.',
    alternativas: ['Ejecucion', 'Obras'],
  },
  {
    canonical:    'Operación',
    orden:        7,
    definicion:   'La obra entra en régimen entregando los bienes o servicios para los que fue diseñada.',
    implicancia:  'Terminada para inversión; se reporta uso o concesión.',
    alternativas: ['Operacion', 'Puesta en Marcha'],
  },
  {
    canonical:    'Sin Ejecución',
    orden:        8,
    definicion:   'Obra existente bajo conservación, mantención o explotación para preservar el nivel de servicio.',
    implicancia:  'No es inversión nueva; se reportan acciones de conservación.',
    alternativas: ['Sin Ejecucion', 'Mantención', 'Conservación', 'Explotación'],
  },
  {
    canonical:    'Terminado',
    orden:        9,
    definicion:   'Proyecto cerrado administrativa y financieramente tras ejecución y entrega final.',
    implicancia:  'Terminal; usualmente sale del buscador público.',
    alternativas: ['Finalizado'],
  },
]

// ── Matcher tolerante a mayúsculas, acentos y variantes léxicas ──────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function buildLookup(pipeline: readonly PipelineMeta[]): (raw: string | null | undefined) => PipelineMeta | null {
  const candidates: { meta: PipelineMeta; key: string }[] = []
  for (const meta of pipeline) {
    candidates.push({ meta, key: norm(meta.canonical) })
    for (const alt of meta.alternativas) candidates.push({ meta, key: norm(alt) })
  }
  // Orden por largo descendente para que "no admitido a tramitacion" gane
  // a "admision" en lookups por substring.
  candidates.sort((a, b) => b.key.length - a.key.length)

  return (raw) => {
    if (!raw) return null
    const r = norm(raw)
    for (const { meta, key } of candidates) {
      if (r === key || r.includes(key) || key.includes(r)) return meta
    }
    return null
  }
}

export const matchSeiaMeta = buildLookup(SEIA_PIPELINE)
export const matchMopMeta  = buildLookup(MOP_PIPELINE)

/** Orden numérico para columnas del kanban. Si el estado/etapa no matchea con
 *  ningún canónico, se manda al final (99). */
export function pipelineOrder(meta: PipelineMeta | null): number {
  return meta ? meta.orden : 99
}
