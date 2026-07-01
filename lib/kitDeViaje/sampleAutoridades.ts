/**
 * Sample data para autoridades regionales (Fase B — solo mientras Fase D no
 * está en pie). Se muestra en el renderer cuando `SeccionAutoridades.disponible
 * === false` para que Diego pueda revisar el LAYOUT antes de invertir en la
 * migración + admin CRUD.
 *
 * Cuando Fase D esté lista, este archivo se borra y la sección lee del backend.
 * Está intencionalmente aislado en un módulo propio para que el cleanup sea
 * `rm lib/kitDeViaje/sampleAutoridades.ts` + un edit chico en el renderer.
 */

import type { AutoridadGrupo, Autoridad } from './types'
import { TITULO_GRUPO_AUTORIDADES } from './constants'

function mk(a: Autoridad): Autoridad { return a }

/**
 * Genera un set plausible de autoridades regionales para preview visual.
 * Los datos son ficticios — sirven para que el diseñador vea el grid, el
 * peso tipográfico y la paginación. NO son datos reales de ninguna región.
 */
export function samplePreviewAutoridades(regionNombre: string): AutoridadGrupo[] {
  const grupos: AutoridadGrupo[] = [
    {
      titulo: TITULO_GRUPO_AUTORIDADES.gobernador_regional,
      layout: 'single',
      autoridades: [
        mk({
          tipo: 'gobernador_regional',
          nombre: 'María Fernanda Rojas Salazar',
          cargo: `Gobernador Regional de ${regionNombre}`,
          telefono: '(+56 9) 8234 5678',
          correo: 'gobernadora@goreregion.cl',
          partido: 'IND',
        }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.dpr,
      layout: 'single',
      autoridades: [
        mk({
          tipo: 'dpr',
          nombre: 'Carlos Ignacio Ramírez Torres',
          cargo: `Delegado Presidencial Regional de ${regionNombre}`,
          telefono: '(+56 9) 7345 8901',
          correo: 'delegado.regional@interior.gob.cl',
          partido: 'PS',
        }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.dpp,
      layout: 'grid',
      autoridades: [
        mk({ tipo: 'dpp', nombre: 'Ana Belén Vergara Pino',      cargo: 'DPP de Provincia 1', telefono: '(+56 9) 6234 5678', correo: 'dpp1@interior.gob.cl', partido: 'PPD', provincia: 'Provincia 1' }),
        mk({ tipo: 'dpp', nombre: 'Jorge Antonio Palma Núñez',    cargo: 'DPP de Provincia 2', telefono: '(+56 9) 6345 6789', correo: 'dpp2@interior.gob.cl', partido: 'PS',  provincia: 'Provincia 2' }),
        mk({ tipo: 'dpp', nombre: 'Camila Rocío Farías Sepúlveda',cargo: 'DPP de Provincia 3', telefono: '(+56 9) 6456 7890', correo: 'dpp3@interior.gob.cl', partido: 'DC',  provincia: 'Provincia 3' }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.seremi,
      layout: 'grid',
      autoridades: [
        mk({ tipo: 'seremi', nombre: 'Rodrigo Esteban Vargas L.', cargo: 'SEREMI de Salud',                  telefono: '(+56 9) 5123 4567', correo: 'salud@seremi.gob.cl',      partido: 'DEM' }),
        mk({ tipo: 'seremi', nombre: 'Valentina Ignacia Correa',  cargo: 'SEREMI de Educación',              telefono: '(+56 9) 5234 5678', correo: 'educacion@seremi.gob.cl',  partido: 'PS' }),
        mk({ tipo: 'seremi', nombre: 'Felipe Andrés Muñoz Reyes', cargo: 'SEREMI de Obras Públicas',         telefono: '(+56 9) 5345 6789', correo: 'obras@seremi.gob.cl',      partido: 'DC' }),
        mk({ tipo: 'seremi', nombre: 'Isidora Paz Rivas Bustos',  cargo: 'SEREMI de Vivienda y Urbanismo',   telefono: '(+56 9) 5456 7890', correo: 'vivienda@seremi.gob.cl',   partido: 'IND-PS' }),
        mk({ tipo: 'seremi', nombre: 'Sebastián Alberto Herrera', cargo: 'SEREMI de Desarrollo Social',      telefono: '(+56 9) 5567 8901', correo: 'desarrollo@seremi.gob.cl', partido: 'PPD' }),
        mk({ tipo: 'seremi', nombre: 'Constanza Beatriz Riquelme',cargo: 'SEREMI de Agricultura',            telefono: '(+56 9) 5678 9012', correo: 'agricultura@seremi.gob.cl',partido: 'IND' }),
        mk({ tipo: 'seremi', nombre: 'Matías Ignacio Cabrera',    cargo: 'SEREMI de Economía',               telefono: '(+56 9) 5789 0123', correo: 'economia@seremi.gob.cl',   partido: 'IND-EVO' }),
        mk({ tipo: 'seremi', nombre: 'Fernanda Alejandra Toro',   cargo: 'SEREMI de Transportes',            telefono: '(+56 9) 5890 1234', correo: 'transporte@seremi.gob.cl', partido: 'PS' }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.senador,
      layout: 'grid',
      autoridades: [
        mk({ tipo: 'senador', nombre: 'Alejandra Sofía Contreras', cargo: 'Senadora Circunscripción 12',   telefono: '(+56 2) 2270 5100', correo: 'acontreras@senado.cl',     partido: 'UDI' }),
        mk({ tipo: 'senador', nombre: 'Diego Ignacio Bravo Silva', cargo: 'Senador Circunscripción 12',    telefono: '(+56 2) 2270 5200', correo: 'dbravo@senado.cl',         partido: 'PS' }),
        mk({ tipo: 'senador', nombre: 'María José Sanhueza',       cargo: 'Senadora Circunscripción 12',   telefono: '(+56 2) 2270 5300', correo: 'msanhueza@senado.cl',      partido: 'PPD' }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.diputado,
      layout: 'grid',
      autoridades: [
        mk({ tipo: 'diputado', nombre: 'Pablo Andrés Ríos Cárdenas',      cargo: 'Diputado Distrito 28',  telefono: '(+56 2) 2270 6100', correo: 'prios@diputados.cl',    partido: 'RN',   distrito: 28 }),
        mk({ tipo: 'diputado', nombre: 'Javiera Camila Torres Espinoza',  cargo: 'Diputada Distrito 28',  telefono: '(+56 2) 2270 6200', correo: 'jtorres@diputados.cl',  partido: 'PC',   distrito: 28 }),
        mk({ tipo: 'diputado', nombre: 'Nicolás Emilio Gutiérrez Ponce',  cargo: 'Diputado Distrito 28',  telefono: '(+56 2) 2270 6300', correo: 'nguti@diputados.cl',    partido: 'PS',   distrito: 28 }),
        mk({ tipo: 'diputado', nombre: 'Trinidad Belén Aguilar Melo',     cargo: 'Diputada Distrito 29',  telefono: '(+56 2) 2270 6400', correo: 'taguilar@diputados.cl', partido: 'REP',  distrito: 29 }),
        mk({ tipo: 'diputado', nombre: 'Rafael Ignacio Salazar Rojas',    cargo: 'Diputado Distrito 29',  telefono: '(+56 2) 2270 6500', correo: 'rsalazar@diputados.cl', partido: 'DEM',  distrito: 29 }),
      ],
    },
    {
      titulo: TITULO_GRUPO_AUTORIDADES.alcalde,
      layout: 'grid',
      autoridades: [
        mk({ tipo: 'alcalde', nombre: 'Ricardo Andrés Muñoz Silva', cargo: 'Alcalde de Ciudad Capital',   telefono: '(+56 9) 8123 4567', correo: 'alcalde@ciudad.cl', partido: 'RN',       comuna: 'Capital' }),
        mk({ tipo: 'alcalde', nombre: 'Carolina Paz Bustos León',   cargo: 'Alcaldesa de Comuna Norte',   telefono: '(+56 9) 8234 5678', correo: 'alcaldia@norte.cl',  partido: 'PS',       comuna: 'Norte' }),
        mk({ tipo: 'alcalde', nombre: 'Fernando José Cruz Godoy',   cargo: 'Alcalde de Comuna Sur',       telefono: '(+56 9) 8345 6789', correo: 'alcaldia@sur.cl',    partido: 'IND-UDI',  comuna: 'Sur' }),
        mk({ tipo: 'alcalde', nombre: 'Loreto Alejandra Vidal V.',  cargo: 'Alcaldesa de Comuna Litoral', telefono: '(+56 9) 8456 7890', correo: 'alcaldia@litoral.cl',partido: 'DC',       comuna: 'Litoral' }),
        mk({ tipo: 'alcalde', nombre: 'Enrique David Miranda Pino', cargo: 'Alcalde de Comuna Rural',     telefono: '(+56 9) 8567 8901', correo: 'alcaldia@rural.cl',  partido: 'PPD',      comuna: 'Rural' }),
        mk({ tipo: 'alcalde', nombre: 'Antonia Ivonne Rojas Fuentes', cargo: 'Alcaldesa de Comuna Cordillera', telefono: '(+56 9) 8678 9012', correo: 'alcaldia@cord.cl', partido: 'IND',   comuna: 'Cordillera' }),
      ],
    },
  ]

  return grupos
}
