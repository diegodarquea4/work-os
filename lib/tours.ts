/**
 * Catálogo de tours guiados del Centro de Ayuda.
 *
 * Cada tour es un HTML autocontenido en public/tour/ (slides animados con
 * narración por SpeechSynthesis, mismo motor que el explainer original) que
 * se embebe en iframe desde AyudaModal y /ayuda.
 *
 * Los subtabs NO se filtran por rol: un tour es documentación (verlo no da
 * acceso a nada) y los archivos en public/ son estáticos de todos modos.
 * Si más adelante hace falta (ej. tour de Permisos solo-admin), agregar un
 * predicado `visible(caps)` acá y filtrar en los consumidores.
 */

export type TourDef = {
  id:          string
  label:       string
  src:         string
  descripcion: string
}

export const TOUR_CATALOG: TourDef[] = [
  {
    id:          'general',
    label:       'Panorama general',
    src:         '/tour/explainer.html',
    descripcion: 'Recorrido completo del panel: mapa, Mi Región, Dashboard, propuestas, Gabinete y Atención.',
  },
  {
    id:          'desalojos',
    label:       'Desalojos',
    src:         '/tour/desalojos.html',
    descripcion: 'La Mesa Interministerial de Desalojos: tablero de casos, fases, capas, calendario y responsables.',
  },
]
