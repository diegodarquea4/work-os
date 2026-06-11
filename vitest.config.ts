import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Configuración de vitest para Work OS.
 *
 * Foco: dolor, no cobertura. Tests para los puntos frágiles identificados
 * en la auditoría y en sesiones previas (lib/db.ts mapRow, lib/dbWrite.ts
 * helpers defensivos, lib/schemas/ validación zod, parseo BCCh, invariante
 * region_id = 0).
 *
 * Entorno: node (no jsdom — NO testeamos UI en este foundation).
 *
 * Etapa 6 de la consolidación backend.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
