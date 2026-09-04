/**
 * Schemas zod para validación de input en API routes.
 *
 * Etapa 4 de la consolidación backend. Cubre el hallazgo 5.3 de la
 * auditoría: las rutas API que reciben body del cliente confiaban en
 * TypeScript, que NO valida en tiempo de ejecución. Si llegaba JSON con
 * forma inesperada, podía terminar como 500 o, peor, escribir basura
 * antes de fallar.
 *
 * Patrón de uso en cada ruta:
 *
 *   import { someSchema } from '@/lib/schemas'
 *
 *   const parse = someSchema.safeParse(await request.json())
 *   if (!parse.success) {
 *     return NextResponse.json(
 *       { error: 'Solicitud inválida', detalle: parse.error.issues },
 *       { status: 400 },
 *     )
 *   }
 *   const body = parse.data  // ahora tipado correctamente
 *
 * Importante:
 *   - El schema acepta EXACTAMENTE lo que el cliente envía hoy. Cualquier
 *     cambio en el schema debe ir junto con un cambio coordinado en el
 *     componente que invoca la ruta.
 *   - El mensaje 400 al usuario es genérico ("Solicitud inválida"); el
 *     detalle de issues queda en logs/response para debugging interno.
 */

import { z } from 'zod'

// ── Building blocks ─────────────────────────────────────────────────────────

/** Code de región — "XV", "I", "RM", etc. Mayúsculas y números romanos. */
const regionCodSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Z]+$/, 'cod de región debe ser solo letras mayúsculas')

/**
 * Fecha en formato display para el header del PDF (ej: "Julio 2026").
 * NO se parsea como Date — se pinta tal cual en el documento.
 */
const fechaDisplaySchema = z
  .string()
  .min(1, 'fecha no puede ser vacía')
  .max(80, 'fecha demasiado larga')

/** Email — validación liviana, solo presencia de '@'. */
const emailSchema = z
  .string()
  .min(3)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email inválido')

/** Region ref mínima — solo cod, resto del objeto pasa sin validar. */
const regionMinSchema = z
  .object({ cod: regionCodSchema })
  .passthrough()

/** Region ref completa — cod + nombre obligatorios (PDF lo usa para slug). */
const regionFullSchema = z
  .object({
    cod:    regionCodSchema,
    nombre: z.string().min(1),
  })
  .passthrough()

// ── /api/cartera-pdf POST ────────────────────────────────────────────────────

// `fecha` es SOLO texto de portada ("Generado: 03-09-2026") — el PDF la pinta
// tal cual, no la parsea. Por eso va con fechaDisplaySchema y no con ISO: el
// cliente manda `toLocaleDateString('es-CL')` (dd-mm-yyyy) desde siempre, y
// exigir YYYY-MM-DD acá dejó la descarga en 400 «Solicitud inválida».
export const carteraPdfSchema = z.object({
  region:     regionMinSchema,
  soloEnFoco: z.boolean(),
  fecha:      fechaDisplaySchema,
})

export type CarteraPdfBody = z.infer<typeof carteraPdfSchema>

// ── /api/cronograma-gabinete POST ────────────────────────────────────────────
// Cronograma de preparación del Gabinete Regional. El server arma todo el
// contenido con service-role (compromisos, foco, trabas) — el cliente solo
// manda la región (cod + nombre para el header del PDF).
export const cronogramaGabineteSchema = z.object({
  region: regionFullSchema,
})

export type CronogramaGabineteBody = z.infer<typeof cronogramaGabineteSchema>

// ── /api/minuta POST ─────────────────────────────────────────────────────────

/**
 * `tipo` acepta 'kit_viaje' como valor canónico (Fase A rediseño) y mantiene
 * 'ficha' como alias legacy durante el rollout — cualquier caller externo o
 * llamada cacheada sigue funcionando. En Fase B el dispatch trata a ambos como
 * el mismo path. Retiro definitivo del alias TBD según analítica en
 * v2_minutas_log.tipo.
 *
 * `format` selecciona el renderer en Fase C. Default 'pdf' preserva el
 * comportamiento actual (respuesta binaria application/pdf).
 */
export const minutaPostSchema = z.object({
  region: regionFullSchema,
  fecha:  fechaDisplaySchema,
  tipo:   z.enum(['ejecutiva', 'ficha', 'kit_viaje']).default('ejecutiva'),
  format: z.enum(['pdf', 'docx']).default('pdf'),
  force:  z.boolean().default(false),
  /** "61" en "Minuta DCI N°61" — solo aplica a 'ficha'/'kit_viaje' (Contexto Regional). */
  numero: z.string().max(20).optional(),
})

export type MinutaPostBody = z.infer<typeof minutaPostSchema>
export type MinutaFormat   = z.infer<typeof minutaPostSchema>['format']
export type MinutaTipoZod  = z.infer<typeof minutaPostSchema>['tipo']

// ── /api/admin/users POST ────────────────────────────────────────────────────

export const adminUsersPostSchema = z.object({
  email:       emailSchema,
  full_name:   z.string().min(1).optional(),
  role:        z.enum(['admin', 'editor', 'regional', 'viewer', 'seremi']),
  region_cods: z.array(z.string().min(1)).optional(),
  // Solo rol seremi: ministerio canónico que acota su cartera (mig 087).
  ministerio:  z.string().min(1).nullable().optional(),
})

export type AdminUsersPostBody = z.infer<typeof adminUsersPostSchema>

// ── /api/admin/users/[id] PATCH ──────────────────────────────────────────────

export const adminUsersPatchSchema = z.object({
  role:          z.enum(['admin', 'editor', 'regional', 'viewer', 'seremi']).optional(),
  region_cods:   z.array(z.string().min(1)).optional(),
  ministerio:    z.string().min(1).nullable().optional(),
  full_name:     z.string().min(1).optional(),
  // Reemplazan al viejo reset_password (que ponía DCI2026):
  recuperar:     z.boolean().optional(),  // emite código nuevo + bloquea la clave anterior + cierra sesiones
  forzar_cambio: z.boolean().optional(),  // marca debe_cambiar_clave + cierra sesiones (sin código)
})

export type AdminUsersPatchBody = z.infer<typeof adminUsersPatchSchema>

// ── /api/account/activate (pública, gateada por código) ──────────────────────

export const accountActivateSchema = z.object({
  email:    emailSchema,
  codigo:   z.string().min(1),
  password: z.string().min(1),
})

export type AccountActivateBody = z.infer<typeof accountActivateSchema>

// ── /api/account/change-password (autenticada) ───────────────────────────────

// `claveActual` es obligatoria: sin ella, quien se apodere de una sesión abierta
// puede cambiar la contraseña y quedarse con la cuenta para siempre. Es el
// mismo campo para el cambio voluntario y para el forzado (en el forzado el
// usuario SÍ recuerda su clave — el flujo para quien la olvidó es Recuperación,
// con código de un solo uso).
export const accountChangePasswordSchema = z.object({
  claveActual: z.string().min(1),
  password:    z.string().min(1),
})

export type AccountChangePasswordBody = z.infer<typeof accountChangePasswordSchema>

// ── /api/desalojos/[n] PATCH ─────────────────────────────────────────────────

export const desalojoDetallePatchSchema = z.object({
  resumen_narrativo: z.string().nullable(),
})

export type DesalojoDetallePatchBody = z.infer<typeof desalojoDetallePatchSchema>

// ── Capa de importancia (migración 024) ──────────────────────────────────────
// Los 3 niveles fijos. Reusable por importParser y por futuras rutas API que
// quieran validar payloads con capa explícita.

export const CAPA_VALUES = ['l', 'll', 'lll'] as const
export const capaSchema = z.enum(CAPA_VALUES)

// ── /api/desalojos/[n]/poligonos POST + PATCH ────────────────────────────────
// Polígonos dibujados sobre el mapa del caso. Nombre + color + coords.
// - `coords` es un array de tuplas [lng, lat] (formato GeoJSON canónico) —
//   el drawing tool y el parser WKT convergen acá. Mínimo 3 vértices.
// - `color` es hex `#rrggbb` para matchear la constraint SQL.

// Exportado para que las rutas de planificación (validación manual, sin zod)
// compartan la misma constraint hex que la constraint SQL y estos schemas.
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

const lngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

export const poligonoCoordsSchema = z.array(lngLatSchema).min(3)

export const poligonoPostSchema = z.object({
  nombre:           z.string().trim().min(1).max(120),
  color:            z.string().regex(HEX_COLOR_RE, 'Color debe ser hex #rrggbb'),
  coords:           poligonoCoordsSchema,
  descripcion:      z.string().trim().max(1000).nullable().optional(),
  planificacion_id: z.number().int().positive().nullable().optional(),   // Etapa (evento top-level) a la que pertenece
})

export const poligonoPatchSchema = z.object({
  nombre:           z.string().trim().min(1).max(120).optional(),
  color:            z.string().regex(HEX_COLOR_RE, 'Color debe ser hex #rrggbb').optional(),
  coords:           poligonoCoordsSchema.optional(),
  descripcion:      z.string().trim().max(1000).nullable().optional(),
  planificacion_id: z.number().int().positive().nullable().optional(),   // re-asignar o desasociar (null) la Etapa
})

export type PoligonoPostBody  = z.infer<typeof poligonoPostSchema>
export type PoligonoPatchBody = z.infer<typeof poligonoPatchSchema>

// ── /api/sesiones/[id]/* — Módulo Sesiones (comités mig 044 + gabinete 046) ──
// Las rutas /cerrar, /acta y /enviar-pauta no llevan body (el borrador ya está
// persistido client-side vía safeWrite); solo se valida el param dinámico. Por
// lo mismo NO hay schema zod para `instancia` ('eje'|'gabinete'): el enforcement
// es el CHECK de BD (mig 046) sobre los inserts client-side — un enum acá sería
// código muerto mientras no exista una ruta que reciba ese campo en el body.

export const sesionIdSchema = z.coerce.number().int().positive()

// ── /api/sesiones/[id]/hoja-conduccion POST — Gabinete v2 (mig 074) ──────────
// Hoja de conducción de 2 caras (descarga binaria, patrón /api/cronograma-gabinete).
// Body opcional: `horaInicio` "HH:MM" — la hora de partida elegida por el DPR,
// base de la hora objetivo por punto. Sin body, el server usa un default.
export const hojaConduccionSchema = z.object({
  horaInicio: z.string().regex(/^\d{1,2}:\d{2}$/, 'hora en formato HH:MM').optional(),
})

export type HojaConduccionBody = z.infer<typeof hojaConduccionSchema>

// ── /api/tarea-gantt-pdf POST ────────────────────────────────────────────────
// El cliente ya tiene las tareas cargadas (vienen de la misma query RLS que
// pinta el tab Planificación) — se mandan tal cual en vez de re-consultar la
// BD server-side, no hay dato nuevo que exponer. `granularidad` es la que el
// usuario tenía seleccionada en la carta Gantt al apretar "Descargar PDF".
export const tareaGanttPdfSchema = z.object({
  nombreIniciativa: z.string().trim().min(1).max(300),
  granularidad: z.enum(['semana', 'mes', 'trimestre', 'anio']),
  tareas: z.array(z.object({
    id: z.number(),
    nombre: z.string().max(300),
    tarea: z.string().max(4000),
    estado: z.enum(['completada', 'en_proceso', 'bloqueada', 'no_iniciada']),
    fecha_inicio: z.string().nullable(),
    fecha_termino: z.string().nullable(),
  })).max(500),
})

export type TareaGanttPdfBody = z.infer<typeof tareaGanttPdfSchema>
