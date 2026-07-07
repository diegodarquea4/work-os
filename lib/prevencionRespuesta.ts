// lib/prevencionRespuesta.ts
// Instrumento de auditoría "Prevención y Respuesta" (COGRID Regional · DCI).
// Definición ESTÁTICA (el contenido vive en código, como PREGO_FASES). Las respuestas por región van a la DB.
// Generado desde la herramienta HTML (fuente de verdad del contenido).

export type Tipo = 'verif' | 'flujo' | 'capt';
export type Estado = 'listo' | 'parcial' | 'nolisto';

export interface Item {
  id: string;          // clave estable del ítem (usar en la DB junto a region_cod)
  tipo: Tipo;
  t: string;           // título
  como: string;        // criterio "cómo debería funcionar"
  checks?: string[];   // casillas "se cumple o no" (el orden es la clave del array de booleanos en la DB)
  prof: string[];      // preguntas guía
  base: string;        // referencia normativa
  sem?: boolean;       // false = sin semáforo (solo comentarios). Ausente = con semáforo.
}
export interface Bloque {
  id: string;
  short: string;       // etiqueta corta (encabezado de columna del consolidado)
  t: string;           // título del bloque
  q: string;           // bajada / pregunta orientadora (subtítulo)
  color: string;       // color del eje (hex)
  tent?: boolean;      // true = "[por confirmar]" (Eje 4)
  items: Item[];
}

export const EJES: Bloque[] = [
  {
    "id": "e1",
    "short": "Orgánica",
    "t": "Eje 1 · Orgánica",
    "q": "¿El sistema está constituido y con roles claros?",
    "color": "#274b7a",
    "items": [
      {
        "id": "o1",
        "tipo": "verif",
        "t": "Constitución y funcionamiento del COGRID Regional",
        "como": "El COGRID Regional lo integran 7 autoridades (DPR que preside, Gobernador/a Regional, Director/a Regional de SENAPRED como Secretaría Técnica Ejecutiva, SEREMIs, Autoridad Militar Regional, Jefe de Zona de Carabineros y Autoridad Regional de Bomberos). En mitigación y preparación sesiona al menos 2 veces al año.",
        "checks": [
          "COGRID Regional constituido por decreto vigente",
          "Sesionó al menos 2 veces el último año",
          "Actas y seguimiento de acuerdos al día",
          "COGRID provinciales constituidos",
          "COGRID comunales constituidos"
        ],
        "prof": [
          "¿Asisten los titulares o delegan? ¿Cuándo fue la última sesión?",
          "¿Cuántos acuerdos quedan abiertos y con qué seguimiento?"
        ],
        "base": "Preg. 4 · Manual COGRID 1.2.1–1.2.3"
      },
      {
        "id": "o2",
        "tipo": "verif",
        "t": "Rol y conducción del DPR como Presidente del COGRID",
        "como": "El/la DPR preside y conduce el COGRID en las cuatro fases, ejerce (o designa) la vocería, coordina con el/la Gobernador/a Regional y mantiene enlace con el COGRID Nacional (Ley N° 21.364).",
        "checks": [
          "Rol claro en cada fase (mitigación, preparación, respuesta y recuperación)",
          "Vocería definida (quién y protocolo)",
          "Mecanismo y encargado de seguimiento de acuerdos"
        ],
        "prof": [
          "¿Puede describir su rol concreto en cada fase?",
          "¿Quién ejerce la vocería y con qué protocolo?",
          "¿Con qué mecanismo hace seguimiento de los acuerdos?",
          "¿Cómo mantiene el enlace con el COGRID Nacional?"
        ],
        "base": "Preg. 1 · Manual COGRID 1.2.6"
      },
      {
        "id": "o3",
        "tipo": "verif",
        "t": "Organización interna de la Delegación para la GRD",
        "como": "La Delegación debe tener una estructura o equipo definido para la GRD, con SEREMIs involucrados, articulación con las Delegaciones Provinciales y los municipios, y nexo con las empresas de servicios esenciales.",
        "checks": [
          "Encargado/a de GRD designado en la Delegación",
          "SEREMIs de GRD involucrados",
          "Articulación con las Delegaciones Provinciales",
          "Articulación con los municipios",
          "Contacto directo con empresas de servicios esenciales"
        ],
        "prof": [
          "¿Con qué equipo o dedicación cuenta el/la encargado/a de GRD?",
          "¿Con qué canal y frecuencia se coordina con provinciales y municipios?",
          "¿Con qué servicios esenciales tiene contacto directo (agua, energía, telecomunicaciones, salud, combustible, vialidad)?"
        ],
        "base": "Preg. 2"
      },
      {
        "id": "o4",
        "tipo": "verif",
        "t": "Activación 24/7 y continuidad operacional",
        "como": "Ante Alerta Roja o emergencia, la Delegación activa su equipo con disponibilidad permanente, asegura continuidad operacional en emergencias prolongadas y contrata con Fondos de Emergencia de forma oportuna.",
        "checks": [
          "Procedimiento de activación del equipo de emergencia",
          "Rol de turnos 24/7 por escrito",
          "Plan de Contingencia para emergencias prolongadas",
          "Procedimiento de contratación con Fondos de Emergencia definido"
        ],
        "prof": [
          "¿Cómo se activa el equipo ante Alerta Roja?",
          "¿En cuánto tiempo puede contratar y qué trabas administrativas ha enfrentado?"
        ],
        "base": "Preg. 3"
      },
      {
        "id": "o5",
        "tipo": "verif",
        "t": "Plan de Enlace y mecanismo de alerta (interno y externo)",
        "como": "Registro oficial de contactos (titulares y suplentes) actualizado; convocatoria por medios redundantes; alerta interna y externa (población, incluido el SAE).",
        "checks": [
          "Plan de Enlace actualizado (≤ 6 meses)",
          "Incluye titulares y suplentes",
          "Comunicación redundante probada",
          "Alerta a la población operativa (incluye SAE)"
        ],
        "prof": [
          "¿Cuándo se probó la redundancia si cae la telefonía o internet?",
          "¿Cómo se dispara la alerta interna y la externa a la población (incluye SAE)?"
        ],
        "base": "Preg. 12 · Manual COGRID 1.2.4 / 2.3"
      },
      {
        "id": "o6",
        "tipo": "flujo",
        "t": "Coordinación con el Gobierno Regional (GORE)",
        "como": "Trabajo conjunto entre la Delegación (coordinación política y de emergencia) y el GORE (inversión y planificación), con mecanismos formales y una agenda común para impulsar iniciativas estratégicas, como obras de mitigación.",
        "checks": [
          "Mecanismo formal de coordinación con el GORE",
          "Iniciativa estratégica conjunta en curso"
        ],
        "prof": [
          "¿Qué materias abordan y cómo se complementan funciones?",
          "¿Cuáles son las principales dificultades y oportunidades de mejora?"
        ],
        "base": "Preg. 14 · Ley N° 21.364"
      }
    ]
  },
  {
    "id": "e2",
    "short": "Prevención",
    "t": "Eje 2 · Prevención",
    "q": "¿La región está preparada?",
    "color": "#1E7D34",
    "items": [
      {
        "id": "p1",
        "tipo": "flujo",
        "t": "Diagnóstico de riesgo (amenazas, puntos críticos, servicios esenciales)",
        "como": "El/la DPR debe conocer las amenazas de la región, los puntos críticos priorizados, la infraestructura crítica y los servicios esenciales, las obras de prevención en curso y estar en contacto con los alcaldes de las comunas más críticas.",
        "checks": [
          "Amenazas y puntos críticos priorizados identificados",
          "Infraestructura crítica catastrada",
          "Servicios esenciales catastrados",
          "Obras o medidas de prevención en los puntos críticos priorizados",
          "Contacto con los alcaldes de las comunas más críticas"
        ],
        "prof": [
          "¿Cuáles son las 3 principales amenazas y cuántos puntos críticos hay (y cuántos Alto/Muy Alto)?",
          "¿Qué comunas concentran el problema y cómo prioriza recursos y obras?",
          "¿Qué obras de prevención hay en marcha en los puntos críticos?",
          "¿Tiene contacto con los alcaldes de las comunas más expuestas?"
        ],
        "base": "Preg. 6 · Manual COGRID 2.1"
      },
      {
        "id": "p2",
        "tipo": "flujo",
        "t": "Plan Invierno Regional: participación, avance y seguimiento",
        "como": "Plan que organiza la preparación de la temporada. El/la DPR debe haber participado en su elaboración y coordinación y contar con un mecanismo de seguimiento de las medidas comprometidas.",
        "checks": [
          "Plan Invierno Regional vigente",
          "DPR participó en su elaboración/coordinación",
          "Mecanismo de seguimiento de medidas comprometidas"
        ],
        "prof": [
          "¿Qué medidas preventivas están priorizadas y qué grado de avance tienen?",
          "¿Qué acciones de mitigación se adoptaron en los puntos críticos y qué brechas le preocupan?"
        ],
        "base": "Preg. 13 · Programa de Invierno"
      },
      {
        "id": "p3",
        "tipo": "verif",
        "t": "Plan Regional para la Reducción del Riesgo de Desastres (RRD)",
        "como": "El COGRID aprueba, a propuesta de SENAPRED, el Plan Regional de RRD (se revisa al menos cada 2 años). El plan puede haberse aprobado antes de la llegada del/la DPR: el foco es que lo conozca y le dé continuidad y seguimiento.",
        "checks": [
          "El/la DPR conoce el Plan Regional de RRD y su estado",
          "Plan aprobado y vigente (revisado ≤ 2 años)",
          "Proyectos prioritarios con seguimiento activo"
        ],
        "prof": [
          "El plan pudo aprobarse antes de su llegada: ¿lo conoce y le está dando seguimiento?",
          "¿Qué obras y proyectos prioritarios de mitigación contempla y cómo avanzan?",
          "¿Cómo van los planes comunales de RRD?"
        ],
        "base": "Preg. 9 · Manual COGRID 2.5.1"
      },
      {
        "id": "p4",
        "tipo": "verif",
        "t": "Plan Regional de Emergencia y Anexos por Amenaza",
        "como": "El COGRID aprueba, a propuesta de SENAPRED, el Plan Regional de Emergencia y sus Anexos por Amenaza. Los organismos deben conocer su rol; deben existir además planes provinciales y comunales.",
        "checks": [
          "Plan Regional de Emergencia aprobado",
          "Anexos por Amenaza en las amenazas principales",
          "Planes provinciales y comunales existentes"
        ],
        "prof": [
          "¿Qué amenazas tienen Anexo por Amenaza? ¿Cuáles faltan?",
          "¿Los organismos responsables conocen y han ejercido su rol?"
        ],
        "base": "Preg. 10 · Manual COGRID 2.5.1"
      },
      {
        "id": "p5",
        "tipo": "verif",
        "t": "Planes sectoriales y coordinación con SEREMIs y empresas",
        "como": "Cada sector (MOP, Energía, Seguridad, Salud, etc.) debe tener su Plan Sectorial de GRD y un catálogo de capacidades, coordinado con SEREMIs y empresas de servicios esenciales.",
        "checks": [
          "Sectores clave con Plan Sectorial de GRD",
          "Catálogo de capacidades por sector",
          "Coordinación establecida con SEREMIs y empresas"
        ],
        "prof": [
          "¿Cómo fluye la información con SEREMIs y empresas de servicios esenciales?",
          "¿Cuáles son los sectores con mayores debilidades?"
        ],
        "base": "Preg. 2 / 10"
      },
      {
        "id": "p6",
        "tipo": "flujo",
        "t": "Organismos Técnicos de Monitoreo de Amenazas (OTMA)",
        "como": "Los OTMA (DMC, SHOA, SERNAGEOMIN, CONAF, CSN, DGA, DOH, Bomberos, etc.) monitorean amenazas específicas. El/la DPR conoce los presentes, qué monitorea cada uno y sus capacidades técnicas.",
        "checks": [
          "OTMA de la región identificados",
          "Se conoce qué amenaza monitorea cada uno",
          "Se conocen sus capacidades técnicas disponibles"
        ],
        "prof": [
          "¿Cómo es la relación con los OTMA y cómo llega su información a la toma de decisiones?",
          "¿Hay un plan claro para operar con ellos en emergencia?",
          "¿Dónde están las brechas de capacidad y tecnología?"
        ],
        "base": "Preg. 7 · Manual COGRID 2.2"
      },
      {
        "id": "p7",
        "tipo": "verif",
        "t": "Ejercicios, simulacros y difusión de planes",
        "como": "La preparación se comprueba con simulacros (regional, provincial y comunal) y con mecanismos para difundir los planes y comprobar su conocimiento.",
        "checks": [
          "Al menos un simulacro o ejercicio el último año",
          "Mecanismo de difusión de planes",
          "Lecciones incorporadas como correcciones"
        ],
        "prof": [
          "¿A qué nivel se hicieron los ejercicios (regional, provincial, comunal)?",
          "¿Cómo se comprueba que los organismos conocen los planes?"
        ],
        "base": "Preg. 11"
      },
      {
        "id": "p8",
        "tipo": "flujo",
        "t": "Coordinación permanente con SENAPRED Regional",
        "como": "El/la Director/a Regional de SENAPRED es la Secretaría Técnica Ejecutiva del COGRID. Debe haber coordinación periódica fuera de emergencia (mesas técnicas, seguimiento de acuerdos).",
        "checks": [
          "Coordinación periódica fuera de emergencia (mesas técnicas)",
          "Seguimiento conjunto de acuerdos"
        ],
        "prof": [
          "¿Cómo es la coordinación y el seguimiento con SENAPRED Regional (mesas técnicas, frecuencia)?",
          "¿Cómo evalúa la relación de trabajo y qué brechas observa?"
        ],
        "base": "Preg. 5"
      }
    ]
  },
  {
    "id": "e3",
    "short": "Respuesta",
    "t": "Eje 3 · Respuesta",
    "q": "¿Puede reaccionar?",
    "color": "#C0392B",
    "items": [
      {
        "id": "r1",
        "tipo": "verif",
        "t": "Stock crítico",
        "como": "Elementos de emergencia (alimentación, agua, kits de aseo, abrigo, camas, etc.) disponibles y dimensionados, con ubicación conocida y mecanismo de reposición.",
        "checks": [
          "Stock crítico dimensionado y disponible",
          "Ubicación de almacenamiento definida",
          "Mecanismo de reposición operativo"
        ],
        "prof": [
          "¿Qué considera hoy el stock crítico (alimentación, agua, abrigo, higiene, energía) y para cuántas personas o días alcanza?",
          "¿Dónde está almacenado y quién lo administra?",
          "¿Qué faltantes identifica para esta temporada?"
        ],
        "base": "Pizarrón · Manual COGRID 2.5"
      },
      {
        "id": "r2",
        "tipo": "verif",
        "t": "Red de albergues",
        "como": "Catastro georreferenciado, con capacidad y estado verificados antes de la temporada, y protocolo de activación, traslado y alimentación.",
        "checks": [
          "Catastro de albergues georreferenciado",
          "Capacidad y estado verificados esta temporada",
          "Protocolo de activación por escrito"
        ],
        "prof": [
          "¿Cuántos albergues hay, con qué capacidad total y en qué comunas?",
          "¿Quién los activa, con qué personal y en cuánto tiempo? ¿Cómo se traslada y alimenta a las personas?"
        ],
        "base": "Pizarrón · Programa de Invierno"
      },
      {
        "id": "r3",
        "tipo": "verif",
        "t": "Proveedores y empresas críticas (catastro y contratación)",
        "como": "Catastro actualizado de empresas de servicios críticos, con contacto disponible fuera de horario y capacidad de contratación oportuna con Fondos de Emergencia.",
        "checks": [
          "Catastro vigente de proveedores críticos con contactos",
          "Contacto disponible fuera de horario, fines de semana y festivos",
          "Contratación oportuna con Fondos de Emergencia"
        ],
        "prof": [
          "¿Cómo se contrata a un proveedor un fin de semana o feriado a medianoche?",
          "¿Qué trabas administrativas afectan la contratación oportuna?"
        ],
        "base": "Preg. 3"
      },
      {
        "id": "r4",
        "tipo": "flujo",
        "t": "Instituciones de respuesta articuladas",
        "como": "Articulación con FF.AA. y policías (Carabineros, PDI), Bomberos, municipios, SAMU, CONAF y sector privado, con la lógica del Sistema de Comando de Incidentes (SCI, desde 2024).",
        "checks": [
          "Protocolos con las instituciones de primera respuesta",
          "Lógica del SCI en uso"
        ],
        "prof": [
          "¿Qué protocolos concretos tiene con cada institución?",
          "¿Cómo se integra el sector privado en la respuesta?"
        ],
        "base": "Pizarrón · Manual COGRID 3.2.1–3.2.2"
      },
      {
        "id": "r5",
        "tipo": "flujo",
        "t": "Manejo de información en emergencia y lecciones aprendidas",
        "como": "Flujo de información oficial (situación, afectación, acciones, brechas, proyección) con periodicidad; evaluación de daños con Informe ALFA, FIBE y FIBEH (SISE); lecciones incorporadas.",
        "checks": [
          "Flujo de información oficial definido",
          "El equipo maneja ALFA / FIBE / FIBEH"
        ],
        "prof": [
          "¿Cada cuánto se actualiza el reporte oficial en emergencia?",
          "¿Qué lecciones de las emergencias recientes se tradujeron en cambios concretos?"
        ],
        "base": "Preg. 8 · Manual COGRID 3.2.3 / Tabla 6"
      }
    ]
  }
];

export const FLUJO: Bloque = {
  "id": "flujo",
  "short": "Prueba de flujo",
  "tent": true,
  "t": "Eje 4 · Prueba de flujo (punta a punta)  [por confirmar]",
  "q": "[Bloque por confirmar: pendiente de definir si se incluye.] ¿El/la DPR sabe conducir una emergencia paso a paso? Plantéale un escenario (p. ej. un sistema frontal severo) y pídele recorrer el flujo. Estos pasos son de criterio: marca el semáforo a mano.",
  "color": "#7a4ea0",
  "items": [
    {
      "id": "f1",
      "tipo": "flujo",
      "t": "1. Alerta y monitoreo",
      "como": "Ante Alerta Temprana Preventiva, Amarilla o Roja, la UAT Regional y los OTMA elevan la información; se refuerza el monitoreo y se difunde la alerta.",
      "prof": [
        "¿Cómo se entera y qué significa cada nivel de alerta?",
        "¿Qué rol cumplen la UAT Regional y los OTMA?"
      ],
      "base": "Manual COGRID 2.3 / Tabla 2"
    },
    {
      "id": "f2",
      "tipo": "flujo",
      "t": "2. Convocatoria y activación del COGRID",
      "como": "Se convoca al COGRID (teléfono, radio o correo, vía Plan de Enlace). Si se pierden las comunicaciones, las autoridades se autoconvocan y concurren a SENAPRED.",
      "prof": [
        "¿A quién convoca y cómo?",
        "¿Qué hace si caen las comunicaciones (autoconvocatoria)?"
      ],
      "base": "Manual COGRID 1.2.4"
    },
    {
      "id": "f3",
      "tipo": "flujo",
      "t": "3. Conducción del COGRID y vocería",
      "como": "El/la DPR conduce la sesión, integra la información, prioriza cursos de acción y define la vocería para informar a la población de forma oportuna.",
      "prof": [
        "¿Cómo dirige y prioriza en la sesión?",
        "¿Quién y cómo comunica a la población?"
      ],
      "base": "Manual COGRID 1.2.5 / 1.2.6"
    },
    {
      "id": "f4",
      "tipo": "flujo",
      "t": "4. Respuesta esencial",
      "como": "Salvamento y protección de vidas (SCI, SAE, perímetros de seguridad), atención de necesidades básicas (stock, albergues) y evaluación de daños (ALFA / FIBE / FIBEH).",
      "prof": [
        "¿Qué acciones de primera respuesta se activan y quién las ejecuta?",
        "¿Cómo levanta los daños y las necesidades?"
      ],
      "base": "Manual COGRID Tabla 7 / 3.2"
    },
    {
      "id": "f5",
      "tipo": "flujo",
      "t": "5. Escalamiento, recursos e instrumentos legales",
      "como": "Escalamiento según nivel (menor → mayor → desastre → catástrofe); Fondos de Emergencia; y, si corresponde, Emergencia Preventiva, Zona Afectada por Catástrofe o Estado de Excepción (JEDENA).",
      "prof": [
        "¿Cuándo y cómo escala al nivel nacional?",
        "¿Qué instrumentos legales existen y para qué sirve cada uno?"
      ],
      "base": "Manual COGRID Tabla 5 / 2.4"
    },
    {
      "id": "f6",
      "tipo": "flujo",
      "t": "6. Recuperación y cierre",
      "como": "Transición a la rehabilitación (restablecer servicios básicos, estabilizar) e incorporación de lecciones aprendidas al cierre de la fase de respuesta.",
      "prof": [
        "¿Cómo transita de la respuesta a la recuperación?",
        "¿Cómo captura lecciones para mejorar?"
      ],
      "base": "Manual COGRID 3.3"
    }
  ]
};

export const CIERRE: Bloque = {
  "id": "cierre",
  "short": "Cierre",
  "t": "Cierre · Brechas y apoyo del nivel central",
  "q": "Síntesis estratégica para la DCI. Sin semáforo: registra la conversación como comentarios.",
  "color": "#334155",
  "items": [
    {
      "id": "c1",
      "tipo": "capt",
      "sem": false,
      "t": "Tres principales brechas y apoyo requerido del nivel central",
      "como": "Que el/la DPR identifique, desde su experiencia, las tres principales brechas que hoy limitan la GRD en su región y qué decisiones, apoyos o medidas necesita del nivel central. Es el insumo directo para la DCI.",
      "prof": [
        "Capacidades institucionales del SINAPRED y recursos humanos especializados",
        "Capacidades de los OTMA y desarrollo tecnológico / monitoreo regional",
        "Implementación de la Ley N° 21.364 y sus instrumentos",
        "Infraestructura crítica, servicios esenciales y mitigación de puntos críticos",
        "Fortalecimiento normativo o reglamentario · capacitación y entrenamiento"
      ],
      "base": "Preg. 15"
    }
  ]
};

export const BLOQUES: Bloque[] = [...EJES, FLUJO];       // con semáforo → entran al consolidado
export const SECCIONES: Bloque[] = [...EJES, FLUJO, CIERRE]; // todo lo que se dibuja
export const ITEMS: Item[] = BLOQUES.flatMap(b => b.items);  // 25 ítems con semáforo (el cierre no cuenta)
export const ID2ITEM: Record<string, Item> = Object.fromEntries(
  SECCIONES.flatMap(b => b.items.map(it => [it.id, it]))
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
// con override manual: respeta r.estado. Ítems sin checks (pasos de flujo): estado manual.
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
