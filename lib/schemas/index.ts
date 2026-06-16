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

/** Fecha ISO YYYY-MM-DD — no valida calendario, solo forma. */
const fechaISOSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha en formato YYYY-MM-DD')

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

export const carteraPdfSchema = z.object({
  region:     regionMinSchema,
  soloEnFoco: z.boolean(),
  fecha:      fechaISOSchema,
})

export type CarteraPdfBody = z.infer<typeof carteraPdfSchema>

// ── /api/minuta POST ─────────────────────────────────────────────────────────

export const minutaPostSchema = z.object({
  region: regionFullSchema,
  fecha:  fechaISOSchema,
  tipo:   z.enum(['ejecutiva', 'completo', 'ficha']).default('completo'),
  force:  z.boolean().default(false),
})

export type MinutaPostBody = z.infer<typeof minutaPostSchema>

// ── /api/admin/users POST ────────────────────────────────────────────────────

export const adminUsersPostSchema = z.object({
  email:       emailSchema,
  full_name:   z.string().min(1).optional(),
  role:        z.enum(['admin', 'editor', 'regional', 'viewer']),
  region_cods: z.array(z.string().min(1)).optional(),
})

export type AdminUsersPostBody = z.infer<typeof adminUsersPostSchema>

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
