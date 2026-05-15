# Reset — Sistema de Indicadores y Minutas DCI v2

> Documento de directrices para la reconstrucción del módulo de Indicadores y Minutas del Work OS.
> Autoría: Diego (DCI, Unidad de Regiones) en conjunto con Claude.
> Versión: 1.1 — 13 de mayo de 2026

## Principios rectores

1. **Menos datos correctos > muchos datos dudosos.** Si una métrica no tiene fuente verificable, no entra al producto.
2. **Long format por defecto.** Toda métrica con periodicidad va en tabla larga `(indicador, región, periodo, valor)`.
3. **Provenance en cada dato.** Cada valor lleva fuente, fecha publicación, fecha carga y calidad.
4. **La IA describe, no opina.** Traduce datos a prosa informativa. No interpreta causas, no recomienda.
5. **Nunca comparar entre periodos de gobierno.** Comparaciones vs año anterior o vs promedio nacional.

## Decisiones cerradas

| # | Decisión |
|---|---|
| 1 | Nombre oficial: **División de Coordinación Interministerial (DCI)**. Nunca "Interregional". |
| 2 | BBDD en Supabase Postgres, múltiples tablas (no formato ancho). |
| 3 | Nunca sobrescribir valores; cada actualización inserta nueva fila. |
| 4 | Nunca comparar periodos de gobierno. |
| 5 | IA describe, no recomienda, no opina, no proyecta. |
| 6 | Ninguna minuta tiene sección "Recomendaciones". |
| 7 | Cada dato con calidad: `verificado`, `preliminar`, `calculado`, `manual`. |
| 8 | Datos faltantes se muestran como "Sin dato (fuente)". |
| 9 | Minutas con `id` único y timestamp, pero **no se archivan** (no `minuta_cache`). |
| 10 | Stack: Next.js 16 · Supabase · Tailwind v4 · @react-pdf/renderer · Claude Sonnet API. |
| 11 | Iniciativas vienen de PREGOs (~2.000+ a nivel país). |
| 12 | Branding: navy `#1A2B5E`, rojo `#D93535`, tipografía **Carlito** (open-source). |

## Reglas para la IA

### Lo que puede hacer
- Describir valores numéricos en prosa fluida
- Identificar outliers cuantitativos
- Señalar discontinuidades metodológicas
- Citar fuente entre paréntesis

### Lo que NO puede hacer
- Recomendar acciones o políticas
- Atribuir causas
- Proyectar consecuencias
- Comparar entre periodos de gobierno
- Usar: "preocupante", "favorable", "credibilidad", "debe", "debería", "estratégico", "se juega", "refleja un", "evidencia un"
- Inventar cifras no presentes en el contexto

### QA obligatoria
1. Lista negra de palabras → falla y reintenta
2. Cada número en output debe existir en contexto
3. Máximo de palabras por sección
4. Regex de formato moneda inválido
5. Después de 3 intentos → fallback no-IA (solo tablas)

## Formato de cifras

| Concepto | Correcto | Incorrecto |
|---|---|---|
| Separador miles | `1.234.567` | `1,234,567` |
| Separador decimal | `12,5%` | `12.5%` |
| Moneda CLP | `4.028 MM$ CLP` | `$4.028,4` |
| Moneda USD | `USD 510 MM` | `USD 510.000.000 MM` |
| Porcentaje | `22,3%` | `22,3 %` |
| Casos/100k | `1.018 casos/100k hab` | `1018 c/100000` |

## Footer estándar minutas

```
[División de Coordinación Interministerial — Ministerio del Interior]
[Mes Año · Minuta {Tipo} · ID {uuid-corto} · Página X de Y]
```

## Identidad visual

| Uso | Hex |
|---|---|
| Primario (navy) | `#1A2B5E` |
| Acento (rojo) | `#D93535` |
| Verde semáforo | `#22C55E` |
| Ámbar semáforo | `#F59E0B` |
| Rojo semáforo | `#DC2626` |
| Gris sin evaluar | `#9CA3AF` |
| Texto principal | `#0F172A` |
| Texto secundario | `#475569` |
| Fondo neutro | `#F8FAFC` |

## Referencia completa

El documento original completo (v1.1, ~490 líneas) con Anexo A de fuentes candidatas,
esquema de base de datos detallado, pipeline de datos, y roadmap fue proporcionado como
input al agente en la sesión del 2026-05-13. Las decisiones y directrices aquí resumidas
son vinculantes para toda implementación futura.
