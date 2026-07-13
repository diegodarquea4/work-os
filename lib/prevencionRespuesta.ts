// lib/prevencionRespuesta.ts
// Instrumento "Prevención y Respuesta" (Checklist · Delegados Presidenciales Regionales).
// Definición ESTÁTICA (el contenido vive en código, como PREGO_FASES). Las respuestas por región van a la DB.
// Contenido: versión final del checklist DPR — Temporada de invierno y fenómeno de El Niño.
// Objetivo: determinar las acciones adicionales preparatorias que debe impulsar cada
// Delegación Presidencial Regional de cara a la temporada de invierno y a El Niño.

export type Tipo = 'verif' | 'flujo' | 'capt';
export type Estado = 'listo' | 'parcial' | 'nolisto';

export interface Item {
  id: string;          // clave estable del ítem (usar en la DB junto a region_cod)
  tipo: Tipo;
  t: string;           // título
  como: string;        // criterio "cómo debería funcionar" / bajada del punto
  checks?: string[];   // casillas "se cumple o no" (el orden es la clave del array de booleanos en la DB)
  prof?: string[];     // preguntas guía (opcional)
  base?: string;       // referencia normativa (opcional)
  sem?: boolean;       // false = sin semáforo (solo comentarios). Ausente = con semáforo.
}
export interface Bloque {
  id: string;
  short: string;       // etiqueta corta (encabezado de columna del consolidado)
  t: string;           // título del bloque
  q: string;           // bajada / pregunta orientadora (subtítulo)
  color: string;       // color del bloque (hex)
  tent?: boolean;      // true = "[por confirmar]"
  items: Item[];
}

export const SECCIONES: Bloque[] = [
  {
    id: 's1',
    short: 'COGRID',
    t: '1. COGRID y rol del Delegado',
    q: 'Revisar cómo se conformó y sesionó el COGRID recientemente, y la participación del Delegado.',
    color: '#274b7a',
    items: [
      {
        id: 'cog1',
        tipo: 'verif',
        t: 'Última conformación',
        como: 'Cuándo sesionó por última vez el COGRID y cómo fue la experiencia.',
      },
      {
        id: 'cog2',
        tipo: 'verif',
        t: 'Participación efectiva del DPR',
        como: 'Conducción de las sesiones y cómo se dio seguimiento a los acuerdos, más allá de la asistencia formal.',
      },
      {
        id: 'cog3',
        tipo: 'verif',
        t: 'Claridad de roles',
        como: '¿Quiénes asistieron y cuál es el rol que debe cumplir cada miembro? Cada integrante debe tener claro su rol dentro del Comité.',
      },
      {
        id: 'cog4',
        tipo: 'verif',
        t: 'Instrumentos y planes de gestión del riesgo',
        como: 'Que el Delegado conozca, a grandes rasgos (no el detalle técnico), los instrumentos de gestión (sistema de planificación, mapas de riesgo y amenaza) y los planes, en especial el Plan de Reducción del Riesgo, que debe manejar el Delegado y no solo la Dirección Regional de SENAPRED. Que el Delegado tenga claro cuáles son los organismos involucrados en las emergencias y qué aporta cada uno.',
      },
    ],
  },
  {
    id: 's2',
    short: 'SEREMIs',
    t: '2. Participación de los SEREMIs en las instancias de coordinación',
    q: 'Asegurar que los servicios sectoriales participen activamente en las instancias donde se planifica y coordina la preparación y la respuesta, y que estén cumpliendo con sus responsabilidades.',
    color: '#0f766e',
    items: [
      {
        id: 'ser1',
        tipo: 'verif',
        t: 'Mesas técnicas',
        como: 'Participación regular de los SEREMIs en las mesas de trabajo preparatorias de la temporada.',
      },
      {
        id: 'ser2',
        tipo: 'verif',
        t: 'COGRID',
        como: 'Asistencia de cada uno de los sectores a las sesiones de COGRID (Titulares vs. Suplentes).',
      },
      {
        id: 'ser3',
        tipo: 'verif',
        t: 'Presencia efectiva de los sectores clave',
        como: 'MOP, Energía, Salud, Educación y Desarrollo Social en cada una de las instancias.',
      },
      {
        id: 'ser4',
        tipo: 'verif',
        t: 'Reuniones con la SEREMI de MOP',
        como: 'Sostener reuniones para confirmar la disponibilidad de capacidades y maquinaria para la temporada.',
        checks: [
          'Retroexcavadoras',
          'Motoniveladoras',
          'Camiones (aljibe y de carga)',
          'Contratos globales vigentes (para disponer de maquinaria de terceros)',
        ],
      },
      {
        id: 'ser5',
        tipo: 'verif',
        t: 'Stock y brechas',
        como: '¿Cuenta la región con stock crítico adecuado/suficiente? ¿Hay claridad de las brechas existentes en la región?',
      },
    ],
  },
  {
    id: 's3',
    short: 'Alcaldes',
    t: '3. Alcaldes de las comunas más críticas · gestión política',
    q: 'Contacto directo con los municipios más expuestos, tanto por su riesgo técnico como por su relevancia política.',
    color: '#b45309',
    items: [
      {
        id: 'alc1',
        tipo: 'verif',
        t: 'Identificación de las comunas más críticas',
        como: 'Priorización según riesgo técnico (puntos críticos, exposición) y político.',
      },
      {
        id: 'alc2',
        tipo: 'verif',
        t: 'Capacidades comunales',
        como: 'Conocer con qué recursos y capacidad de respuesta cuenta cada municipio.',
      },
      {
        id: 'alc3',
        tipo: 'verif',
        t: 'Contacto con los alcaldes',
        como: 'Gestión política directa con los alcaldes de esas comunas.',
      },
    ],
  },
  {
    id: 's4',
    short: 'Sector privado',
    t: '4. Identificación de capacidades del sector privado',
    q: 'Catastrar los proveedores y colaboradores privados que pueden aportar recursos durante una emergencia.',
    color: '#6d28d9',
    items: [
      {
        id: 'priv1',
        tipo: 'verif',
        t: 'Maestro de proveedores',
        como: 'Catastro formal de las empresas que prestan servicios críticos.',
      },
      {
        id: 'priv2',
        tipo: 'verif',
        t: 'Colaboraciones ocasionales',
        como: 'Identificación de privados que pueden colaborar de manera puntual.',
      },
      {
        id: 'priv3',
        tipo: 'verif',
        t: 'Disponibilidad',
        como: 'Confirmar qué recursos están efectivamente disponibles.',
      },
      {
        id: 'priv4',
        tipo: 'verif',
        t: 'Tiempo de respuesta',
        como: 'Conocer en cuánto tiempo pueden movilizarse.',
      },
      {
        id: 'priv5',
        tipo: 'verif',
        t: 'Movimiento adelantado',
        como: 'Posibilidad de pre-posicionar recursos antes del evento.',
      },
      {
        id: 'priv6',
        tipo: 'verif',
        t: 'Informe ALFA y control de la contratación',
        como: 'Claridad del proceso de activación.',
      },
    ],
  },
  {
    id: 's5',
    short: 'Comunicación',
    t: '5. Comunicación de riesgo',
    q: 'Preparar la comunicación pública para informar a la población de forma oportuna y consistente.',
    color: '#be185d',
    items: [
      {
        id: 'com1',
        tipo: 'verif',
        t: 'Puntos de prensa',
        como: 'Definición y programación de los puntos de prensa.',
      },
      {
        id: 'com2',
        tipo: 'verif',
        t: 'Entrevistas',
        como: 'Disponibilidad de voceros para entrevistas en medios.',
      },
      {
        id: 'com3',
        tipo: 'verif',
        t: 'Monitoreo de medios',
        como: 'Seguimiento de medios locales y nacionales en las zonas afectadas.',
      },
      {
        id: 'com4',
        tipo: 'verif',
        t: 'Distribución de voceros',
        como: 'Asignar voceros regionales o provinciales según la zona afectada. Definir roles y temas competentes a cada vocero (el Delegado debe evitar hablar de tecnicismos).',
      },
    ],
  },
];

// Box de estado de la región (encabezado del formulario). NO entra al consolidado
// ni al conteo de ítems: se persiste como una fila más de prevencion_respuesta con
// item_id 'estado_region', usando el campo comentarios para el texto libre.
export const STATUS_ITEM: Item = {
  id: 'estado_region',
  tipo: 'capt',
  t: 'Estado actual de la región',
  como: 'Resumen general de la situación de la región de cara a la temporada.',
  sem: false,
};

export const BLOQUES: Bloque[] = SECCIONES;                    // todos con semáforo → entran al consolidado
export const ITEMS: Item[] = BLOQUES.flatMap(b => b.items);   // ítems con semáforo (el status no cuenta)
export const ID2ITEM: Record<string, Item> = Object.fromEntries(
  [...SECCIONES.flatMap(b => b.items), STATUS_ITEM].map(it => [it.id, it]),
);

// ---- estado de una respuesta (una fila DB por region_cod + item_id) ----
export interface Respuesta {
  estado: Estado | null;   // usado solo cuando manual === true (o en ítems sin checks)
  manual: boolean;         // true = el usuario fijó el color a mano (override)
  checks: boolean[];       // alineado a Item.checks por índice
  comentarios: { ts: number; texto: string; autor?: string }[];
}
export const respuestaVacia = (it: Item): Respuesta => ({
  estado: null, manual: false,
  checks: (it.checks ?? []).map(() => false),
  comentarios: [],
});

// ---- lógica del semáforo (idéntica a la herramienta HTML) ----
// verif/con-checks y sin override: 0 marcadas = sin evaluar (null); todas = 'listo'; algunas = 'parcial'.
// con override manual: respeta r.estado. Ítems sin checks: estado manual.
export function estadoDe(r: Respuesta | undefined, it: Item): Estado | null {
  if (!r) return null;
  if (r.manual) return r.estado ?? null;
  const T = it.checks?.length ?? 0;
  if (T) {
    const n = (r.checks ?? []).filter(Boolean).length;
    if (n === 0) return null;
    return n === T ? 'listo' : 'parcial';
  }
  return r.estado ?? null;
}

// ---- color de celda del consolidado (por bloque y región) ----
// rojo si algún ítem 'nolisto'; amarillo si hay parciales o quedan ítems sin evaluar;
// verde solo si TODOS los ítems del bloque están 'listo'; gris si nada evaluado.
export type CeldaColor = 'verde' | 'amarillo' | 'rojo' | 'gris';
export function colorBloque(
  respPorItem: Record<string, Respuesta | undefined>,
  items: Item[],
): CeldaColor {
  let any = false, red = false, amber = false, allListo = true;
  for (const it of items) {
    const e = estadoDe(respPorItem[it.id], it);
    if (e) any = true;
    if (e === 'nolisto') red = true;
    if (e === 'parcial') amber = true;
    if (e !== 'listo') allListo = false;
  }
  if (!any) return 'gris';
  if (red) return 'rojo';
  if (amber) return 'amarillo';
  return allListo ? 'verde' : 'amarillo';
}

// ---- etiquetas y clases Tailwind (consistentes con PREGO_ESTADO_CONFIG del panel) ----
export const ESTADO_LABEL: Record<Estado, string> = { listo: 'Listo', parcial: 'Parcial', nolisto: 'No listo' };
export const ESTADO_PILL: Record<Estado | 'sin', string> = {
  listo:   'bg-green-50 text-green-700 ring-1 ring-green-200',
  parcial: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  nolisto: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  sin:     'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
};
export const CELDA_PILL: Record<CeldaColor, string> = {
  verde:    'bg-green-50 text-green-700 ring-1 ring-green-200',
  amarillo: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  rojo:     'bg-red-50 text-red-700 ring-1 ring-red-200',
  gris:     'bg-gray-100 text-gray-400 ring-1 ring-gray-200',
};
