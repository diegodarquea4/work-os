// Enums permitidos de las columnas de `prioridades_territoriales` (espejo del
// template de importación). Viven aquí —módulo liviano, sin dependencias— para
// que un consumidor de UI (p. ej. la barra de edición masiva del Dashboard)
// pueda reusar los valores válidos SIN arrastrar `xlsx` a su bundle, que es lo
// que pasaría al importarlos desde lib/importParser.ts. `importParser` los
// re-exporta para no romper sus importadores.

export const VALID_EJE_GOBIERNO   = ['Economía', 'Social', 'Seguridad'] as const
export const VALID_RAT            = ['No Requiere', 'No Ingresado', 'En Tramitación', 'FI', 'IN', 'OT', 'RE', 'RS', 'AD', 'CF'] as const
export const VALID_ETAPA          = ['Preinversión', 'Prefactibilidad', 'Diseño', 'Ejecución', 'Terminado'] as const
export const VALID_ESTADO_TERMINO = ['Inaugurado/Terminado/Presentado', 'Término Diseño', 'Inicio Obras/Programa', 'Término Obras/Programa', 'Término Etapa Preinversional', 'Adjudicación de Licitación', 'En Operación', 'Otro'] as const
export const VALID_PROXIMO_HITO   = ['Otro', 'Obtención RS', 'Obtención Financiamiento', 'Presentación Core', 'Publicación Bases Licitación', 'Adjudicación Licitación', 'Término Diseño/Preinversión', 'Primera Piedra', 'Inicio Obras/Programa', 'Inicio Obras', 'Término Obras/Programa', 'Término Obras', 'Inauguración', 'Finalizado'] as const
export const VALID_FUENTE         = ['FNDR', 'Mixto', 'Sectorial', 'Privado', 'FONDEMA', 'PEDZE'] as const
export const VALID_SEMAFORO       = ['verde', 'ambar', 'rojo', 'gris'] as const
export const VALID_CAPA           = ['l', 'll', 'lll'] as const
