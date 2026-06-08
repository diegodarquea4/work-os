/**
 * Catálogo del FAQ del Centro de Ayuda. Estático versionado por git —
 * el catálogo per-rol esperado es < 100 entries, no justifica tabla en BD.
 *
 * Audiencia → quién ve la FAQ:
 *   - 'todos'        → cualquier usuario autenticado
 *   - 'regional'     → solo role === 'regional'
 *   - 'admin_editor' → admin y editor (gestión del catálogo, propuestas)
 *   - 'admin'        → solo admin (usuarios, configuración global)
 *
 * Discovery del contenido: lib/help/FAQ_DISCOVERY.md (2026-06-08).
 *
 * Cuando edites una entry, actualizá `ultima_revision`. Cuando agregués
 * una nueva, generá un `id` único kebab-case en la convención
 * `<categoria-corta>-<tema>`.
 */

export type FaqAudiencia = 'todos' | 'regional' | 'admin_editor' | 'admin'

export type FaqEntry = {
  id:              string
  audiencia:       FaqAudiencia
  categoria:       string
  pregunta:        string
  respuesta:       string
  relacionadas?:   string[]
  ultima_revision: string
}

const CONTACTO = 'diego.darquea@interior.gob.cl'

export const FAQ_CATALOG: FaqEntry[] = [
  // ── 0. Primeros pasos ────────────────────────────────────────────────────
  {
    id: 'inicio-primeros-pasos',
    audiencia: 'todos',
    categoria: 'Primeros pasos',
    pregunta: 'Es mi primera vez en el panel, ¿qué hago?',
    respuesta:
`Te recomendamos este orden la primera vez:

1. Mira el tour guiado completo desde este mismo Centro de Ayuda. Son 16 pasos con narración, te toma 5 minutos.
2. Abre el Mapa y haz clic en tu región. Vas a ver tu cartera completa de iniciativas.
3. Entra a Mi Región. Ahí tienes tu tablero: avance promedio, semáforo, alertas activas y avance por eje.
4. Lee primero las "Alertas activas". Lo que está bloqueado o sin actividad es lo que merece tu atención inmediata.
5. Marca con la bandera (🚩) las 3 o 4 iniciativas que necesitas vigilar esta semana — se reúnen en tu Bandeja de Atención.

Si te pierdes en cualquier momento, vuelve a tocar el ? del header.`,
    relacionadas: ['inicio-rutina-semanal', 'inicio-orden-revision', 'foco-marcar'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'inicio-rutina-semanal',
    audiencia: 'regional',
    categoria: 'Primeros pasos',
    pregunta: '¿Cómo conviene usar el panel en mi rutina semanal?',
    respuesta:
`Una rutina que funciona bien para equipos regionales:

LUNES (30-45 min)
- Abre la Bandeja de Atención. Revisa lo que está "En foco" y agrega/quita banderas según tu cabeza de la semana.
- Descarga el Excel de tu región desde Mi Región o desde el modal "Proponer actualización".
- Actualiza solo las celdas que cambiaron: semáforos, % avances, próximos hitos, responsables, fechas.
- Súbelo como propuesta. Un editor de la división la revisa en el día.

DURANTE LA SEMANA
- Cualquier cambio puntual (un semáforo, agregar un seguimiento, marcar/desmarcar foco) lo haces directo en la ficha de la iniciativa, sin Excel.
- Si vas a gabinete: descarga el Kit de Viaje desde Mi Región, o la cartera por ministerio en PDF desde el Kanban.

VIERNES (5 min)
- Revisa "Mis propuestas" para confirmar que la del lunes quedó aprobada o atender si pidió correcciones.`,
    relacionadas: ['carga-cadencia', 'carga-semaforo-vs-excel', 'minutas-tres-formatos'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'inicio-orden-revision',
    audiencia: 'regional',
    categoria: 'Primeros pasos',
    pregunta: '¿Por dónde empiezo a revisar mi cartera cada día?',
    respuesta:
`Empieza siempre por las "Alertas activas" en Mi Región. Te muestra dos cosas:

- Hitos próximos a vencer (≤ 7 días).
- Iniciativas sin actividad hace +15 días.

Después la Bandeja de Atención: la lista corta de lo que tú marcaste como prioritario. Si una iniciativa está en rojo (bloqueada), esa es tu prioridad de la semana — no avanza sin tu gestión.

Si te sobra tiempo, revisa el avance por eje. Te da contexto agregado de qué área del plan regional está al día y cuál atrasada.`,
    relacionadas: ['inicio-rutina-semanal', 'foco-marcar', 'semaforo-vs-avance'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'inicio-atajos',
    audiencia: 'todos',
    categoria: 'Primeros pasos',
    pregunta: '¿Qué atajos de teclado tiene el panel?',
    respuesta:
`Por ahora hay un atajo global:

- ?  (Shift + /) → abre este Centro de Ayuda desde cualquier vista.

Dentro del tour:
- ← / →  navegar entre pasos
- Espacio → pausar/reproducir
- ↻  reiniciar

Esc cierra cualquier modal abierto (ficha, indicadores, ayuda).

Si echas en falta algún atajo en particular, escríbenos.`,
    relacionadas: ['cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },

  // ── 1. Carga semanal ────────────────────────────────────────────────────
  {
    id: 'carga-descargar-excel',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Dónde descargo el Excel pre-llenado de mi región?',
    respuesta:
`Tienes dos caminos para descargarlo, los dos generan el mismo archivo:

1. Desde Mi Región → botón "Proponer actualización" → dentro del modal hay un enlace "Descarga las iniciativas actuales de [tu región]".
2. Desde el Kanban → botón "Descargar cartera" arriba a la derecha.

El Excel viene con tu cartera completa pre-llenada y trae una hoja extra "Ejes válidos" con los ejes del catálogo de tu región — úsala como referencia para no escribir uno que no exista.`,
    relacionadas: ['carga-celdas-modificar', 'ejes-formato-canonico'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-celdas-modificar',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Tengo que llenar todas las celdas o solo las que cambiaron?',
    respuesta:
`Solo las que cambiaron. El sistema hace diff inteligente:

- Las celdas que dejas intactas se mantienen igual a lo que ya está en el panel.
- Las celdas que modificas reemplazan el valor existente.

Para crear iniciativas nuevas, agrégalas al final del Excel con la columna # (número) vacía. El sistema las trata como INSERT, no como UPDATE.

Para borrar una iniciativa, no la elimines del Excel (solo se la salta el sistema). Pídele a un admin que la borre directo, o ponlo en el comentario de tu propuesta.`,
    relacionadas: ['carga-descargar-excel', 'carga-estado-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-sin-cambios',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Subí el Excel y no veo los cambios en mi cartera, ¿qué pasó?',
    respuesta:
`No es un error. Toda carga vía Excel queda como propuesta "Pendiente" hasta que un admin de la división la revise y apruebe.

Para ver el estado:
- En Mi Región, abajo de todo está "Mis propuestas" con tus cargas y su estado actual.

Tiempos esperados de revisión: en general el mismo día hábil. Si llevas 48 hábiles sin respuesta, escríbenos directo (${CONTACTO}).

Los cambios que sí ves al instante son los que haces directo en la ficha (semáforo, avance, foco, seguimientos) — esos no pasan por propuesta.`,
    relacionadas: ['carga-estado-propuesta', 'carga-semaforo-vs-excel'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-estado-propuesta',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Cómo sé si mi propuesta ya fue revisada?',
    respuesta:
`En Mi Región, baja hasta "Mis propuestas". Vas a ver tus cargas con uno de estos estados:

- Pendiente (gris) → esperando revisión.
- Aprobada (verde) → revisada y aplicada al panel. Te muestra cuántas filas insertó y cuántas actualizó.
- Rechazada (rojo) → no se aplicó nada. Al hacer clic ves la nota del revisor explicando el motivo.
- Aplicada con avisos (ámbar) → se aplicó pero algunas filas tuvieron errores parciales (típicamente semáforo o fecha mal formada). Al hacer clic ves qué filas fallaron.

La lista se ordena por fecha de envío, la más reciente arriba.`,
    relacionadas: ['carga-aplicada-con-avisos', 'carga-leer-rechazo'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-aplicada-con-avisos',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Mi propuesta quedó "Aplicada con avisos", ¿qué hago?',
    respuesta:
`Quiere decir que se aplicó pero algunas filas no pasaron la validación y quedaron sin actualizar.

Pasos:
1. Haz clic en la propuesta en "Mis propuestas". Te abre el detalle con la lista de filas que fallaron y el motivo de cada una.
2. Causas típicas: semáforo escrito distinto a los 4 valores válidos (verde / ambar / rojo / gris), fecha en formato no estándar, % avance mayor a 100, ministerio que no está en el catálogo.
3. Descarga un Excel nuevo (ya viene con los cambios que SÍ se aplicaron), corrige solo las filas que fallaron, y súbelo como nueva propuesta.

No necesitas reenviar el Excel original — el sistema ya tomó lo que era válido.`,
    relacionadas: ['carga-descargar-excel', 'carga-rehacer-rechazada'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-leer-rechazo',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Me rechazaron la propuesta, ¿dónde leo el motivo?',
    respuesta:
`En Mi Región → "Mis propuestas" → clic en la propuesta rechazada. La nota del revisor aparece destacada en el detalle.

Toda propuesta rechazada lleva nota obligatoria del admin: la división no rechaza en silencio. Si la nota no es clara o necesitas más contexto, escríbenos directo al canal de contacto y mencionamos el ID de la propuesta.`,
    relacionadas: ['carga-rehacer-rechazada', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-rehacer-rechazada',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Si me rechazan la propuesta, ¿rehago todo o corrijo lo que falló?',
    respuesta:
`Corrige solo lo que falló. No hay que rehacer desde cero.

Recomendado:
1. Lee la nota del revisor para entender el motivo (¿faltaba un dato? ¿valor inválido? ¿incoherencia?).
2. Descarga un Excel nuevo desde Mi Región (te trae el estado actual del panel, no el rechazado).
3. Aplica las correcciones que pide el revisor + lo nuevo que querías subir.
4. Súbelo como propuesta nueva. Idealmente en el comentario menciona "Corrige rechazo del [fecha]" para trazabilidad.

El archivo rechazado se borra del Storage para no acumular basura, pero la nota del revisor y el log quedan en el historial.`,
    relacionadas: ['carga-leer-rechazo', 'carga-descargar-excel'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-cancelar-propuesta',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Puedo cancelar una propuesta que ya envié si me equivoqué?',
    respuesta:
`Sí, mientras esté en estado "Pendiente". En Mi Región → "Mis propuestas" → al pasar el mouse sobre la propuesta pendiente aparece la opción de cancelarla (también queda como "borrar" en el menú contextual).

Cancelar elimina el archivo del Storage y borra el registro — es como si nunca la hubieras enviado.

Si ya fue aprobada o rechazada, no se puede cancelar (ya tuvo efecto en el panel o ya fue revisada). En ese caso, manda una propuesta nueva con la corrección.`,
    relacionadas: ['carga-estado-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-eje-no-existe',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'El panel me dice "eje no existe en el catálogo", ¿qué hago?',
    respuesta:
`Significa que el Excel trae un eje (o varios) que no está en el catálogo formal de tu región. El panel bloquea la carga antes de subir el archivo para evitar inconsistencias.

Pasos:
1. El mensaje de error te lista qué ejes están mal y en qué filas. Anótalos.
2. Verifica el formato canónico: "Eje N: Nombre" (con dos puntos). Por ejemplo "Eje 1: Infraestructura". Si solo escribiste el número o si usaste guion (—) en lugar de dos puntos, ajústalo.
3. Si el eje realmente no está en tu catálogo (no es un error de tipeo), pídele a tu contraparte DCI que lo agregue desde "Gestionar ejes" en Mi Región. Para hacerlo rápido, escríbenos con el número y nombre exacto que necesitas.
4. Vuelve a corregir el Excel con el eje canónico y reenvíalo.

Para evitar este error a futuro: revisa siempre la hoja "Ejes válidos" del Excel descargado, ahí está la lista actualizada de tu región.`,
    relacionadas: ['ejes-mi-region', 'ejes-formato-canonico', 'permisos-pedir-eje'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-ministerio-bip-bloqueado',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Por qué no puedo cambiar el ministerio o el código BIP en el Excel?',
    respuesta:
`Sí puedes editarlos en el Excel, pero esos campos se consideran estructurales: cuando los modificas, el admin va a revisar especialmente esa fila para confirmar el cambio antes de aprobarlo.

Es esperable: ministerio responsable, código BIP, eje, prioridad o RAT son decisiones que afectan trazabilidad histórica, reportes a Hacienda y comparabilidad entre regiones. La división DCI las valida.

Lo operativo (semáforo, % avance, próximo hito, responsable, fechas, etapa) se aplica directo sin revisión adicional.

Si el cambio estructural es urgente, súbelo igual y avísanos en el comentario de la propuesta para que lo prioricemos.`,
    relacionadas: ['permisos-eje-no-edita', 'permisos-ficha-editables'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-cadencia',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Cada cuánto tengo que subir la actualización?',
    respuesta:
`La cadencia esperada es semanal, idealmente los lunes. Eso es lo que el panel considera "al día" — si pasan más de 7 días sin actualización, aparece en las alertas de "sin actividad".

No es obligatorio que sea lunes específicamente; lo importante es la regularidad. Hay equipos que prefieren cargar viernes en la tarde para llegar limpios al lunes. Lo que NO recomendamos es saltarse semanas: la cartera "viejita" pierde valor de gestión y obliga a actualizar muchas cosas a la vez.

En semanas tranquilas alcanza con un Excel mínimo (1-2 cambios). El gesto de cargar comunica a la división que el equipo regional está activo.`,
    relacionadas: ['inicio-rutina-semanal'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-semaforo-vs-excel',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Si edito el semáforo directo en la ficha, ¿también lo subo en el Excel?',
    respuesta:
`No, no lo dupliques. El cambio directo en la ficha se aplica al instante y queda en el log de la iniciativa.

Las dos vías son complementarias:
- Ficha → cambios puntuales del día a día (un semáforo, agregar un seguimiento, marcar foco). Inmediato.
- Excel → cambios masivos de la semana, especialmente cuando movés muchas iniciativas a la vez. Pasa por revisión.

Si subes el Excel con el semáforo que ya cambiaste en la ficha, el sistema simplemente lo vuelve a guardar igual — no duplica, pero te ocupa un slot en el historial. Mejor solo carga lo que efectivamente cambió desde la última vez.`,
    relacionadas: ['carga-celdas-modificar', 'permisos-ficha-editables'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-doble-carga',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: 'Otro miembro del equipo y yo subimos propuestas casi a la vez, ¿qué pasa?',
    respuesta:
`No se pisan en el momento de subida — ambas quedan como propuestas "Pendientes" independientes en "Mis propuestas".

Cuando un admin las aprueba, las aplica en orden de llegada. Si tu compañero y tú modificaron la misma celda de la misma iniciativa, gana el que aprobaron último (last-write-wins). Por eso es buena práctica coordinarse internamente: una sola persona del equipo asume la carga semanal, o se reparten por ejes/ministerios para no chocar.

Si descubres un conflicto post-aprobación, súbelo de nuevo con el valor correcto.`,
    relacionadas: ['carga-estado-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-historico-excel',
    audiencia: 'regional',
    categoria: 'Carga semanal',
    pregunta: '¿Puedo ver los Excel anteriores que subí?',
    respuesta:
`Los archivos crudos no se guardan después de aprobada o rechazada la propuesta — se borran del Storage para no acumular peso. Pero el log de cambios sí queda.

Para auditar qué cambió y cuándo:
- En la ficha de cada iniciativa, la pestaña "Historial" muestra todo el log de cambios (qué se modificó, quién, cuándo, qué valor anterior).
- En "Mis propuestas" cada entry tiene metadata: cuántas filas insertó, cuántas actualizó, comentario que mandaste.

Si necesitas el Excel original concreto por una razón puntual (auditoría externa, por ejemplo), escríbenos antes de que se apruebe.`,
    relacionadas: ['carga-estado-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-aprobar-propuesta',
    audiencia: 'admin',
    categoria: 'Carga semanal',
    pregunta: '¿Cómo apruebo o rechazo una propuesta?',
    respuesta:
`Las propuestas pendientes están en el panel admin de "Importar propuestas" (acceso desde el menú admin). Cada una muestra: región, autor, fecha, comentario del regional y un preview del diff.

Pasos para aprobar:
1. Clic en la propuesta → se abre el preview con todas las filas (INSERT y UPDATE marcadas con badge).
2. Revisa el diff. Las filas con errores ya están señalizadas (semáforo inválido, etc.).
3. Botón "Aprobar" → aplica todo lo válido. Si hay filas con error parcial, el estado queda como "Aplicada con avisos" y el regional ve cuáles fallaron.

Pasos para rechazar:
1. Botón "Rechazar" → te exige una nota explicando el motivo. La nota es obligatoria, no se puede rechazar en silencio.
2. La nota le aparece al regional al abrir la propuesta en "Mis propuestas".

El archivo se borra del Storage después de la decisión, pero el log queda.`,
    relacionadas: ['carga-aprobar-parcial', 'carga-canal-rechazo'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-canal-rechazo',
    audiencia: 'admin',
    categoria: 'Carga semanal',
    pregunta: 'Al rechazar, ¿la nota le llega al regional por correo?',
    respuesta:
`Hoy no. La nota vive solo dentro del panel — el regional la ve al abrir la propuesta rechazada en "Mis propuestas".

Si el rechazo es por algo crítico o tiempo-sensible (ej. la región necesita corregir antes de un comité de mañana), complementá la nota con un correo o llamada directa. La nota del panel es para trazabilidad, no para notificación urgente.

Tener notificación por correo de rechazos está en la lista de mejoras a futuro; por ahora, la combinación nota + canal humano funciona.`,
    relacionadas: ['carga-aprobar-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-aprobar-parcial',
    audiencia: 'admin',
    categoria: 'Carga semanal',
    pregunta: '¿Puedo aprobar solo algunas filas y descartar las que tienen error?',
    respuesta:
`Indirectamente, sí. Cuando apruebas una propuesta, el sistema aplica todas las filas válidas y SOLO las marcadas con error quedan sin aplicar. El estado final es "Aplicada con avisos" y el regional ve cuáles fallaron.

No hay (todavía) un toggle por fila para decir "esta sí, esta no" antes de aprobar. La intención es que el regional re-cargue las filas con error en la siguiente propuesta, una vez que entendió el motivo.

Si una propuesta tiene tantos errores que no quieres aplicar nada, mejor rechazarla con nota: "Tiene muchos errores de formato, te recomiendo revisar X y reenviar."`,
    relacionadas: ['carga-aprobar-propuesta', 'carga-aplicada-con-avisos'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'carga-bandeja-pendientes',
    audiencia: 'admin',
    categoria: 'Carga semanal',
    pregunta: '¿Dónde veo todas las propuestas pendientes de todas las regiones?',
    respuesta:
`En el panel admin de "Importar propuestas". Ahí están todas en una sola lista, ordenadas por fecha (más antigua arriba para que no se acumulen).

Filtros disponibles:
- Por estado: pendiente / aprobada / rechazada / aplicada con avisos.
- Por región.
- Por autor.

Para mantener el flujo sano, conviene que el equipo admin acuerde quién revisa cada día (rotación) o reparta por región. Lo más importante es que no queden propuestas pendientes >48h hábiles — la confianza del regional en el sistema se construye con respuesta rápida.`,
    relacionadas: ['carga-aprobar-propuesta'],
    ultima_revision: '2026-06-08',
  },

  // ── 2. Permisos y roles ─────────────────────────────────────────────────
  {
    id: 'permisos-roles-existentes',
    audiencia: 'todos',
    categoria: 'Permisos y roles',
    pregunta: '¿Qué roles existen en el panel y qué hace cada uno?',
    respuesta:
`Hay cuatro roles:

- Regional: equipos de Delegaciones Presidenciales Regionales. Ven solo su(s) región(es). Editan operativo (semáforo, % avance, foco, seguimientos). Cargan cambios estructurales vía Excel/propuesta.
- Editor: equipo DCI central. Ven todas las regiones. Editan estructural y operativo directo. Gestionan catálogo de ejes y métricas. NO aprueban propuestas ni gestionan usuarios.
- Admin: jefatura DCI. Todo lo del editor + aprobar/rechazar propuestas + gestionar usuarios + acceso al PREGO.
- Viewer: solo lectura. Para autoridades externas o equipos que necesitan visibilidad sin tocar.

Las diferencias entre regional y editor/admin no son jerárquicas, son de scope: regional sabe lo que pasa en terreno, admin/editor mantiene la coherencia estructural y compara entre regiones.`,
    relacionadas: ['permisos-eje-no-edita', 'permisos-mi-rol'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-mi-rol',
    audiencia: 'todos',
    categoria: 'Permisos y roles',
    pregunta: '¿Quién decide qué rol tengo yo?',
    respuesta:
`Lo decide la jefatura de la División de Coordinación Interministerial cuando se da de alta tu cuenta. La asignación se hace en función de tu lugar de trabajo y responsabilidades:

- Si trabajas en una Delegación Regional → Regional, scope a tu región.
- Si trabajas en DCI central operativo → Editor.
- Si tienes responsabilidad jefatural en DCI → Admin.

Para cambiar de rol (te promovieron, cambiaste de unidad, etc.) escríbenos a ${CONTACTO} con el cambio que necesitas y el visto bueno de tu jefatura directa.`,
    relacionadas: ['cuenta-contacto-dci', 'permisos-elevar-temporal'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-elevar-temporal',
    audiencia: 'regional',
    categoria: 'Permisos y roles',
    pregunta: '¿Puedo elevar mis permisos temporalmente para hacer un cambio puntual?',
    respuesta:
`No hay elevación temporal de permisos. Si necesitas hacer un cambio estructural (cambiar un eje, agregar un ministerio responsable, modificar un código BIP), tienes dos vías:

1. Súbelo en tu próxima propuesta semanal con un comentario claro: "Cambio estructural urgente: [iniciativa] cambia de eje X a eje Y porque…". El admin lo aplica al revisar.
2. Para algo realmente urgente (mismo día), escríbenos directo y lo hacemos a mano: ${CONTACTO}.

La separación de permisos no es burocrática, es para mantener trazabilidad: cada cambio estructural queda con autor + motivo. Eso te protege cuando alguien pregunta "¿por qué este proyecto cambió de eje?".`,
    relacionadas: ['carga-ministerio-bip-bloqueado', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-eje-no-edita',
    audiencia: 'regional',
    categoria: 'Permisos y roles',
    pregunta: '¿Por qué no puedo cambiar el eje de una iniciativa si yo la conozco mejor?',
    respuesta:
`El eje es un campo estructural: define a qué prioridad del plan regional pertenece la iniciativa, y eso afecta los reportes agregados de la división y la comparabilidad entre regiones. Por eso solo admin/editor puede modificarlo directo en la ficha.

Tu vía:
1. En el Excel de carga semanal, puedes proponer el cambio de eje. El admin lo revisa al aprobar.
2. Si es urgente, escríbenos al contacto DCI con el cambio que pides y el motivo.

No es desconfianza en tu juicio — al contrario, es para que el cambio quede registrado con un motivo claro y no se pierda en el log.`,
    relacionadas: ['permisos-ficha-editables', 'carga-ministerio-bip-bloqueado', 'ejes-mi-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-ficha-editables',
    audiencia: 'regional',
    categoria: 'Permisos y roles',
    pregunta: '¿Qué campos sí puedo editar directo en la ficha sin pasar por Excel?',
    respuesta:
`Todo lo operativo, es decir lo que cambia día a día:

- Semáforo (verde / ámbar / rojo / gris).
- % avance.
- Responsable.
- Etapa actual.
- Próximo hito y su fecha.
- Marcar/desmarcar foco (la bandera 🚩).
- Agregar/editar seguimientos (la pestaña "Seguimiento" en la ficha).
- Subir/eliminar documentos (la pestaña "Documentos").
- Comentarios y notas.

Lo que NO puedes editar directo (es estructural, va vía Excel):
- Eje, ministerio, prioridad (alta/media/baja), código BIP, RAT, inversión, fuente de financiamiento, fechas de inicio/término oficiales.`,
    relacionadas: ['permisos-eje-no-edita', 'carga-semaforo-vs-excel'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-ver-otras-regiones',
    audiencia: 'regional',
    categoria: 'Permisos y roles',
    pregunta: '¿Puedo ver iniciativas de otras regiones para comparar?',
    respuesta:
`No. El scope del rol regional es tu región (o tus regiones, si tienes asignadas varias). El mapa principal muestra todas las regiones del país pero solo puedes hacer clic en las tuyas — las demás quedan grises.

La razón: las iniciativas pueden tener información sensible que cada equipo regional gestiona; abrir visibilidad cruzada sin un protocolo claro genera más confusión que valor.

Si necesitas un comparativo nacional (avance por eje a nivel país, distribución por ministerio, etc.) pídeselo a un editor de la división. Tienen acceso a reportes agregados que respetan la confidencialidad por iniciativa.`,
    relacionadas: ['permisos-roles-existentes', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-pedir-eje',
    audiencia: 'regional',
    categoria: 'Permisos y roles',
    pregunta: '¿Cómo pido que me agreguen un eje nuevo al catálogo de mi región?',
    respuesta:
`Hoy el canal es manual: escríbenos a ${CONTACTO} con dos datos.

1. Número que quieres asignarle (debe ser único en tu región y normalmente sigue la secuencia 1, 2, 3…).
2. Nombre exacto del eje.

Un admin/editor lo agrega desde "Gestionar ejes" en Mi Región. Una vez creado, ya puedes referenciarlo en tus Excel de carga sin que el panel lo rechace.

A futuro vamos a habilitar un botón "Pedir nuevo eje" directo desde el modal de Proponer cuando detecte un eje desconocido. Por ahora, correo.`,
    relacionadas: ['ejes-mi-region', 'carga-eje-no-existe'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-editor-alcance',
    audiencia: 'admin_editor',
    categoria: 'Permisos y roles',
    pregunta: '¿Puedo editar iniciativas de cualquier región o solo de algunas?',
    respuesta:
`Como editor (o admin), tienes alcance nacional: puedes editar iniciativas de las 16 regiones, gestionar sus catálogos de ejes y revisar sus propuestas (aprobar es solo admin).

La distinción operativo/estructural NO aplica a ti: editas todo en línea desde la ficha.

Cuidado con la responsabilidad: cuando editas algo en una región, queda registrado en el log con tu email. Si vas a hacer un cambio masivo (>10 iniciativas), preferí hacerlo vía Excel para que la trazabilidad sea más limpia.`,
    relacionadas: ['permisos-roles-existentes'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-editor-no-aprueba',
    audiencia: 'admin_editor',
    categoria: 'Permisos y roles',
    pregunta: '¿Por qué no puedo aprobar propuestas si soy editor?',
    respuesta:
`Aprobar/rechazar propuestas es exclusivo de rol admin. La razón es separar la edición operativa (que pueden hacer muchos) de la decisión de validación (que centraliza criterio).

Si eres editor y ves una propuesta que necesita aprobarse urgente:
- Revisa el diff y déjalo listo en tu cabeza.
- Pídele a un admin que la apruebe (mejor con un mensaje directo).
- Si pasa muy seguido que necesitas aprobar, conversa con la jefatura para revisar la asignación de roles.`,
    relacionadas: ['permisos-roles-existentes', 'carga-aprobar-propuesta'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-editor-no-crea-usuarios',
    audiencia: 'admin_editor',
    categoria: 'Permisos y roles',
    pregunta: '¿Puedo crear usuarios nuevos para una delegación regional?',
    respuesta:
`No, crear usuarios es exclusivo de admin. Si recibiste el contacto de un equipo regional que necesita acceso:

1. Pídele su correo institucional, nombre completo y región a la que pertenece.
2. Pasáselo a un admin con esos tres datos para que cree la cuenta.

Una vez creada, el usuario recibe la invitación por correo con una contraseña inicial que debe cambiar al primer login.`,
    relacionadas: ['permisos-admin-crear-usuario', 'cuenta-sin-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-admin-crear-usuario',
    audiencia: 'admin',
    categoria: 'Permisos y roles',
    pregunta: '¿Cómo asigno un usuario nuevo a una región?',
    respuesta:
`Desde la vista Usuarios (visible solo para admin):

1. Botón "Nuevo usuario".
2. Llenas correo institucional, nombre completo, rol y región(es) asignada(s) si va a ser regional.
3. El sistema le envía un correo de invitación con una contraseña inicial.

Para asignar a varias regiones (regional multi-delegación, raro pero existe), seleccionas varios cods en el selector. El usuario verá todas como "tu cartera" desde el mapa.

Si el usuario ya existe y solo necesitas cambiarle el scope o el rol, abrí su ficha en la lista y edita ahí (no creés duplicados).`,
    relacionadas: ['permisos-admin-cambiar-rol', 'cuenta-multi-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'permisos-admin-cambiar-rol',
    audiencia: 'admin',
    categoria: 'Permisos y roles',
    pregunta: '¿Cómo cambio el rol de un usuario existente?',
    respuesta:
`En la vista Usuarios: clic en el usuario → editar → selector de rol → guardar.

Atenciones al cambiar de rol:
- De regional a editor/admin: el usuario gana acceso a todas las regiones. Las region_cods asignadas dejan de aplicar (los ignora porque el rol superior tiene scope global).
- De editor/admin a regional: debes asignarle explícitamente al menos una región, si no, no ve nada al entrar.
- De cualquier rol a viewer: el usuario pasa a solo lectura. No edita nada.

El cambio aplica al próximo login del usuario (o al refrescar su sesión).`,
    relacionadas: ['permisos-admin-crear-usuario', 'cuenta-cambio-delegacion'],
    ultima_revision: '2026-06-08',
  },

  // ── 3. Ejes ──────────────────────────────────────────────────────────────
  {
    id: 'ejes-mi-region',
    audiencia: 'regional',
    categoria: 'Ejes',
    pregunta: '¿Dónde veo los ejes oficiales de mi región?',
    respuesta:
`Tres lugares, todos muestran lo mismo:

1. Mi Región → sección "Avance por eje estratégico". Cada tarjeta es un eje con su número, nombre, % de avance y monto de inversión.
2. El Excel de carga semanal trae una hoja "Ejes válidos" con la lista del catálogo de tu región.
3. Kanban en vista "Por eje" → cada columna es un eje.

Si ves un eje extraño o falta uno que debería estar, escríbenos a ${CONTACTO} para corregir el catálogo.`,
    relacionadas: ['carga-eje-no-existe', 'permisos-pedir-eje'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-otro-ministerio-eje',
    audiencia: 'regional',
    categoria: 'Ejes',
    pregunta: 'Otro ministerio me pasó un Excel con un eje que no está en mi catálogo, ¿lo agrego?',
    respuesta:
`Tú no puedes crear ejes, solo admin/editor. Dos caminos:

1. Si el eje es importante para tu región (no es solo del otro ministerio), pídenos que lo agreguemos al catálogo formal: ${CONTACTO}.
2. Si el eje del otro ministerio no aplica a tu región (es solo de ellos), puedes mapearlo a tu eje equivalente más cercano y dejarlo así. Cada región tiene su propio catálogo, no tienen que coincidir.

Ojo: si subes el Excel con un eje desconocido sin avisarnos, el panel te bloquea la carga antes. Mejor resuélvelo primero.`,
    relacionadas: ['carga-eje-no-existe', 'permisos-pedir-eje'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-formato-canonico',
    audiencia: 'regional',
    categoria: 'Ejes',
    pregunta: '¿Cómo escribo el nombre del eje en el Excel para que no me dé error?',
    respuesta:
`El formato canónico es:

    Eje N: Nombre

Por ejemplo: "Eje 1: Infraestructura y Conectividad", "Eje 3: Salud y Servicios Básicos".

Reglas:
- Empieza con "Eje" (mayúscula primera letra), espacio, número, dos puntos, espacio, nombre.
- El número debe coincidir con el número que tiene ese eje en el catálogo de tu región.
- El nombre puede tener mayúsculas, minúsculas, acentos, eñes — no es case-sensitive para el match.

Variantes que también funcionan al subir (las normaliza el sistema): "EJE 1: ...", "eje 1 - ...", "Eje 1 — ...". Pero al descargar el Excel siempre te lo va a entregar en formato canónico.

Si el número no existe en el catálogo, el panel rechaza la carga con un mensaje específico.`,
    relacionadas: ['carga-eje-no-existe', 'ejes-mi-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-por-que-numero',
    audiencia: 'todos',
    categoria: 'Ejes',
    pregunta: '¿Por qué cada eje tiene un número? ¿Importa el orden?',
    respuesta:
`Sí importa, por dos razones:

1. El número es la clave del catálogo: cuando subes un Excel, el sistema matchea por número, no por nombre. Si renombras un eje pero mantienes el número, todas las iniciativas y métricas siguen apuntando a él.
2. El orden de visualización en el panel sigue el número. "Eje 1" siempre va antes que "Eje 2" en las tarjetas, columnas del Kanban y reportes.

Recomendación: usa numeración 1..N por orden de prioridad estratégica de tu plan regional. Evita saltos (1, 2, 5, 6) — confunde y no aporta.

Cada región tiene su propia numeración: Eje 1 de Antofagasta no tiene nada que ver con Eje 1 de Biobío, son catálogos separados.`,
    relacionadas: ['ejes-formato-canonico', 'ejes-mi-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-iniciativa-multi-eje',
    audiencia: 'regional',
    categoria: 'Ejes',
    pregunta: '¿Una iniciativa puede pertenecer a dos ejes a la vez?',
    respuesta:
`No. Cada iniciativa tiene exactamente un eje asignado. La razón es operativa: los reportes agregados (% de avance por eje, inversión por eje) necesitan asignar la iniciativa a un eje único para no inflar los totales.

Si una iniciativa cae naturalmente en dos áreas (ej. "Hospital con sala cuna" → Salud + Familia), elige el eje que mejor representa el objetivo principal. En el campo "Comentario" o "Notas" de la ficha puedes mencionar el aporte transversal.

Para reportes que cruzan ejes (ej. inversión en "salud" sumando varias áreas), pídele a un editor el agregado a medida.`,
    relacionadas: ['ejes-mi-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-crear',
    audiencia: 'admin_editor',
    categoria: 'Ejes',
    pregunta: '¿Cómo creo un eje nuevo para una región?',
    respuesta:
`En Mi Región (con la región seleccionada) → botón "Gestionar ejes" junto al título "Avance por eje estratégico" → se abre el panel CRUD.

Pasos:
1. Botón "Agregar eje".
2. Asigna un número único (1-99, no repite con los existentes).
3. Escribe solo el nombre puro: "Salud y Servicios Básicos" — sin prefijo "Eje N:". El panel arma la composición sola.
4. Guardar.

El eje queda disponible inmediatamente para asignar en iniciativas y métricas, y aparece en la hoja "Ejes válidos" del próximo Excel descargado de esa región.`,
    relacionadas: ['ejes-renombrar-impacto', 'ejes-eliminar-con-iniciativas'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-renombrar-impacto',
    audiencia: 'admin_editor',
    categoria: 'Ejes',
    pregunta: '¿Puedo renombrar un eje sin romper las iniciativas que lo referencian?',
    respuesta:
`Sí, siempre que mantengas el número. Las iniciativas y métricas referencian al eje por FK (eje_id), no por nombre — entonces cambiar el nombre solo cambia el display.

Lo que SÍ debes evitar:
- Cambiar el NÚMERO de un eje en uso. Eso rompería el match en los Excel históricos y descolocaría el orden.
- Renombrar a algo conceptualmente muy distinto. "Salud" → "Infraestructura" generaría reportes confusos. Si el cambio conceptual es grande, mejor crear un eje nuevo y reasignar las iniciativas una por una.

Tras renombrar, los próximos Excel descargados van a traer el nombre nuevo. Los reportes y minutas también lo reflejan al regenerarse.`,
    relacionadas: ['ejes-crear', 'ejes-eliminar-con-iniciativas'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'ejes-eliminar-con-iniciativas',
    audiencia: 'admin_editor',
    categoria: 'Ejes',
    pregunta: '¿Qué pasa si intento eliminar un eje que ya tiene iniciativas o métricas?',
    respuesta:
`El sistema te lo impide con un error claro: "No se puede eliminar: tiene X iniciativas y Y métricas". Es protección contra borrados accidentales que dejarían filas huérfanas.

Si realmente quieres eliminarlo:

1. Reasigna primero todas las iniciativas a otro eje (una por una desde la ficha, o vía Excel masivo).
2. Reasigna o elimina las métricas asociadas.
3. Una vez que quede sin dependencias, el botón eliminar funciona.

Recomendación: para fusionar dos ejes que en realidad son lo mismo, mover todo al "ganador" y luego eliminar el "perdedor".`,
    relacionadas: ['ejes-crear'],
    ultima_revision: '2026-06-08',
  },

  // ── 4. Métricas y PREGO ──────────────────────────────────────────────────
  {
    id: 'metricas-reportar-valor',
    audiencia: 'regional',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Dónde reporto el valor actual de las métricas de mi región?',
    respuesta:
`En Mi Región → haz clic en cualquier tarjeta de eje en "Avance por eje estratégico" → se abre el drawer de métricas de ese eje.

Cada métrica muestra: valor actual, meta y barra de avance. Botón "Actualizar valor" → modal con input del nuevo valor + fecha del reporte.

Cadencia: idealmente semanal, alineado con tu carga del Excel. Aunque las métricas no se cargan vía Excel — se reportan directo en la UI.

Si una métrica no aplica esta semana (ej. la mides trimestralmente), simplemente no la actualices. El panel deja el último valor reportado.`,
    relacionadas: ['metricas-meta-mal', 'metricas-vs-avance', 'metricas-frecuencia'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'metricas-meta-mal',
    audiencia: 'regional',
    categoria: 'Métricas y PREGO',
    pregunta: 'La meta de una métrica está mal, ¿la puedo corregir?',
    respuesta:
`Tú no, la meta la define admin/editor de DCI. Es parte del compromiso programático estructural — modificarla por tu cuenta rompería la lógica de "compromiso negociado".

Si crees que la meta está mal calibrada (muy alta, muy baja, refleja un alcance distinto del proyecto), escríbenos con tu propuesta de cambio y el motivo. Si la jefatura está de acuerdo, un editor la ajusta.

Lo que tú sí puedes y debes hacer: reportar el valor actual real con honestidad, aunque esté lejos de la meta. El panel sirve para mostrar la verdad, no para inflar números.`,
    relacionadas: ['metricas-reportar-valor', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'prego-fases-donde',
    audiencia: 'regional',
    categoria: 'Métricas y PREGO',
    pregunta: 'Veo "PREGO 4/9" en Mi Región pero no encuentro dónde abrir las fases, ¿dónde está?',
    respuesta:
`La vista completa del PREGO (Plan Regional de Gobierno) es exclusiva de admin/editor de DCI. Tú ves el indicador "X/9" en el header de Mi Región para que sepas en qué fase está tu región, pero el detalle por fase y la gestión las maneja la división central.

Tu rol en el PREGO: reportar evidencia de cumplimiento cuando la división te lo pida. Habitualmente la evidencia se sube como documento adjunto a una iniciativa específica o se envía por el canal de contacto.

Para saber en qué fase está hoy tu región y qué se necesita para avanzar, conversa con tu contraparte en DCI.`,
    relacionadas: ['prego-avanzar-fase', 'permisos-roles-existentes'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'metricas-vs-avance',
    audiencia: 'regional',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Cuál es la diferencia entre una métrica de eje y el % de avance de una iniciativa?',
    respuesta:
`Son dos cosas distintas que conviene no confundir:

% AVANCE DE INICIATIVA
- Es por iniciativa individual (ej. "Reposición Hospital Provincial: 72%").
- Mide cuánto se avanzó respecto al alcance total de ESE proyecto.
- Lo reportas tú directamente en la ficha o en el Excel.

MÉTRICA DE EJE
- Es agregada y temática (ej. "Cobertura de conectividad rural: 71%").
- Mide cumplimiento del COMPROMISO programático del plan regional, transversal a muchas iniciativas.
- La meta la define DCI; tú reportas el valor actual semanal.

Una iniciativa puede estar al 100% y la métrica del eje seguir al 40% si el compromiso requería más iniciativas para cumplirse.`,
    relacionadas: ['metricas-reportar-valor', 'semaforo-vs-avance'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'metricas-frecuencia',
    audiencia: 'regional',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Tengo que reportar todas las métricas con la misma frecuencia (semanal)?',
    respuesta:
`No necesariamente. Algunas métricas naturalmente se miden semanal (ej. casos resueltos), otras mensual (ej. cobertura), trimestral (ej. PIB) o anual (ej. pobreza).

Recomendado:
- Reporta cada métrica con la frecuencia natural del indicador.
- Si una métrica no cambió desde el último reporte, no la actualices — el panel deja el último valor visible.
- Si una métrica se mide trimestral pero todavía no llegó el dato del trimestre, deja el valor anterior y no lo modifiques.

Si una métrica necesita una frecuencia clara (ej. "actualizar quincenal en todas las regiones"), DCI la acuerda al definirla.`,
    relacionadas: ['metricas-reportar-valor'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'metricas-crear',
    audiencia: 'admin_editor',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Cómo defino una métrica nueva para un eje?',
    respuesta:
`Desde el drawer de métricas del eje (Mi Región → tarjeta del eje):

1. Botón "Nueva métrica".
2. Nombre claro y específico ("Kilómetros de ruta mejorados", no "Avance en infraestructura").
3. Unidad (km, %, MM$, casos, etc.).
4. Meta numérica.
5. Frecuencia esperada de reporte (referencial).
6. Guardar.

La métrica queda visible para el equipo regional, quien va a reportar valores. Recomendación: máximo 3-5 métricas por eje. Más de eso satura y se vuelve invisible al regional.`,
    relacionadas: ['metricas-meta-cualitativa', 'metricas-reportar-valor'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'metricas-meta-cualitativa',
    audiencia: 'admin_editor',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Cómo manejo una métrica que es cualitativa o subjetiva (ej. "satisfacción ciudadana")?',
    respuesta:
`El panel solo acepta valores numéricos en las métricas — es por diseño, para que sean comparables y agregables.

Caminos para manejar lo cualitativo:

1. Convertirlo a numérico: "satisfacción ciudadana" → "% de encuestados que califican el servicio como bueno o muy bueno", basado en encuesta periódica.
2. Usar una escala discreta: 1 a 5, donde 5 es "óptimo". Documenta el criterio en el nombre o en una nota interna.
3. Si realmente no se puede cuantificar, no es una métrica: tradúcelo a una iniciativa específica con seguimientos cualitativos (más útil que un número falso).

Lo importante: una métrica con un número que nadie sabe de dónde sale es peor que no tenerla.`,
    relacionadas: ['metricas-crear'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'prego-avanzar-fase',
    audiencia: 'admin_editor',
    categoria: 'Métricas y PREGO',
    pregunta: '¿Cómo avanzo a una región a la siguiente fase del PREGO?',
    respuesta:
`En la vista PREGO (acceso solo admin/editor desde el menú superior):

1. Selecciona la región.
2. Abre la fase actual → revisa la evidencia cargada por el equipo regional.
3. Si los requisitos están cumplidos, botón "Aprobar fase" → la región avanza a la siguiente.
4. Si no, deja comentarios indicando qué falta para que el equipo regional cargue lo pendiente.

Cada cambio de fase queda registrado con autor, fecha y nota. La región puede ver su nuevo "X/9" en Mi Región en su próximo refresh.`,
    relacionadas: ['prego-fases-donde', 'prego-notifica-regional'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'prego-notifica-regional',
    audiencia: 'admin_editor',
    categoria: 'Métricas y PREGO',
    pregunta: 'Cuando avanzo una fase del PREGO, ¿se le avisa al regional?',
    respuesta:
`Hoy no hay notificación automática por correo. La región ve el cambio en su próximo login (el contador "X/9" se actualiza).

Si el avance de fase es relevante (típicamente lo es), complementá con un correo o llamada al equipo regional. La nota que dejas en el panel queda para trazabilidad histórica, no para enterar urgente.

Notificación automática por correo está en la lista de mejoras a futuro.`,
    relacionadas: ['prego-avanzar-fase'],
    ultima_revision: '2026-06-08',
  },

  // ── 5. Atención y foco ───────────────────────────────────────────────────
  {
    id: 'foco-marcar',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Cómo marco una iniciativa en foco?',
    respuesta:
`Dos lugares:

1. Desde la ficha: arriba a la derecha hay un botón "🚩 Marcar foco". Clic → la bandera se llena de rojo y la iniciativa entra a la Bandeja de Atención.
2. Desde cualquier card (en Mi Región, Kanban, Dashboard): la bandera 🚩 a la derecha del card. Clic → mismo efecto.

Para desmarcar: clic de nuevo en la bandera. La iniciativa sale de la bandeja inmediatamente.

El foco es compartido a nivel región: si tu compañero marcó algo, también lo ves tú, y viceversa.`,
    relacionadas: ['foco-desaparecio', 'foco-visibilidad-equipo'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'foco-desaparecio',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: 'Marqué algo en foco y desapareció de la bandeja, ¿qué pasó?',
    respuesta:
`Tres causas probables, en orden de probabilidad:

1. Lo desmarcaste sin querer. Si clicas la bandera de un card que ya estaba en foco, se desmarca. Solución: marcarlo de nuevo.
2. Un compañero del equipo lo desmarcó. El foco es compartido a nivel región. Si alguien decidió que ya no era prioridad, le quitó la bandera.
3. La iniciativa fue eliminada o reasignada a otra región. Raro pero posible si un admin hizo limpieza.

Para confirmar qué pasó, abre la ficha de la iniciativa → pestaña "Historial". Ahí queda el log de cambios de foco con autor y fecha.`,
    relacionadas: ['foco-marcar', 'foco-visibilidad-equipo'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'foco-visibilidad-equipo',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: 'La Bandeja de Atención ¿la ven los otros del equipo o solo yo?',
    respuesta:
`La ven todos los que tienen acceso a tu región. El foco es un estado compartido a nivel región, no personal.

Implicancia práctica: si tu equipo es de 3 personas y tu compañero marca 8 iniciativas en foco, tú vas a verlas todas. Si el equipo no se coordina, la bandeja se llena de banderas y pierde valor.

Recomendación: acuerden quién maneja el foco (ej. el coordinador) o que cada uno marque solo lo de su área. Y revisen la bandeja juntos al inicio de la semana — toma 5 minutos y alinea prioridades.`,
    relacionadas: ['foco-marcar', 'foco-limite'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'foco-sugerencias-criterio',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Qué son las "Sugerencias automáticas" y con qué criterio aparecen?',
    respuesta:
`Son iniciativas que el panel cree que conviene que mires, basado en señales objetivas. Aparecen en la sección colapsable debajo de "En foco" (haz clic en el chevron para expandirla).

Criterios actuales (combinación, no exclusivos):
- Bloqueadas (semáforo rojo) que NO están marcadas en foco.
- Con hito próximo a vencer (≤ 7 días) y todavía no las viste.
- Sin actividad reciente (+15 días) pero con prioridad alta.
- Con cambio de semáforo en los últimos 3 días.

Son sugerencias, no obligaciones. Si una sugerencia no tiene sentido para tu cabeza (sabes algo del contexto que el panel no sabe), no la marques.`,
    relacionadas: ['foco-sugerencia-descartar', 'foco-marcar'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'foco-sugerencia-descartar',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Puedo descartar una sugerencia automática para que no aparezca más?',
    respuesta:
`Hoy no hay un botón "no me sugieras esto". Las sugerencias se calculan en vivo según los criterios de actividad/estado de la iniciativa. Si quieres que deje de sugerirse:

- Soluciona la causa: actualiza el semáforo si es rojo "porque sí" desde hace meses, agrega un seguimiento si está sin actividad, o cierra el hito vencido.
- Si es algo que NO depende de ti (otro ministerio bloqueado), márcalo en foco una vez y la próxima iteración deja de sugerirla porque ya está atendida.

A futuro vamos a agregar un "ignorar sugerencia por 30 días" — si lo necesitas urgente, escríbenos.`,
    relacionadas: ['foco-sugerencias-criterio'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'foco-limite',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Cuántas iniciativas puedo tener en foco al mismo tiempo?',
    respuesta:
`No hay límite técnico. Pero la bandeja deja de ser útil pasado las 10-15 banderas — se convierte en otra "lista larga" que ya no te ayuda a priorizar.

Sugerencia operativa: máximo 5-7 iniciativas en foco a la vez por equipo regional. Lo que sobre, sácalo del foco aunque siga siendo importante (sigue en tu cartera, solo que no en la bandeja).

Regla simple: si miras la bandeja y no podés "atacarla" en una sesión de trabajo de 2-3 horas, hay demasiadas banderas.`,
    relacionadas: ['foco-marcar', 'foco-visibilidad-equipo'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'atencion-agendar-seguimiento',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Cómo agendo un seguimiento o reunión sobre una iniciativa?',
    respuesta:
`En la ficha de la iniciativa → pestaña "Seguimiento" → botón "Nuevo seguimiento".

Tipos disponibles:
- Hito: un milestone con fecha objetivo (ej. "Inicio de obras: 30-06-2026"). Marca como completado cuando se cumpla.
- Reunión: registra cuándo te reuniste y con quién, con notas.
- Nota: para apuntes libres que quieras dejar registrados.
- Riesgo: para flaggear algo que puede impactar el avance.

Los hitos con fecha próxima (≤ 7 días) aparecen automáticamente en tus "Alertas activas" de Mi Región. La pestaña "Calendario" de la ficha muestra todos los hitos en línea de tiempo.`,
    relacionadas: ['atencion-alertas-email', 'inicio-orden-revision'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'atencion-alertas-email',
    audiencia: 'regional',
    categoria: 'Atención y foco',
    pregunta: '¿Puedo recibir alertas por correo cuando algo cambia?',
    respuesta:
`Hoy no hay notificaciones automáticas por correo. El panel asume que entras al menos una vez por semana y revisas tu Bandeja de Atención y las alertas activas.

Si necesitas un canal de aviso para algo específico (un hito clave de un proyecto sensible), la recomendación pragmática es:
- Crea el hito en la ficha con la fecha objetivo.
- Pon un recordatorio en tu calendario personal (Outlook, Google Calendar).
- El panel te muestra el hito en las alertas activas cuando esté a ≤7 días.

Notificaciones por correo está en la lista de mejoras a futuro, prioridad media.`,
    relacionadas: ['atencion-agendar-seguimiento'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'semaforo-vs-avance',
    audiencia: 'todos',
    categoria: 'Atención y foco',
    pregunta: '¿Cuál es la diferencia entre el semáforo y el % de avance?',
    respuesta:
`Son dos lecturas complementarias de la misma iniciativa.

% AVANCE
- Es objetivo y numérico: 0%, 35%, 80%.
- Mide PROGRESO físico/operativo respecto al alcance total.
- Una iniciativa puede estar al 80% y estar bloqueada por algo externo.

SEMÁFORO
- Es subjetivo y categórico: verde / ámbar (revisión) / rojo (bloqueada) / gris (sin evaluar).
- Mide JUICIO sobre el estado: ¿avanza sano? ¿necesita atención? ¿está parada?
- Una iniciativa al 35% puede estar en verde si va a tiempo, y otra al 80% puede estar en rojo si se trabó.

Por eso ambos importan: el avance dice "cuánto", el semáforo dice "cómo va".`,
    relacionadas: ['metricas-vs-avance', 'permisos-ficha-editables'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'kanban-vacio',
    audiencia: 'todos',
    categoria: 'Atención y foco',
    pregunta: 'El Kanban se ve vacío, ¿por qué?',
    respuesta:
`Causas habituales, en orden de probabilidad:

1. Filtro de región muy restrictivo: en la barra superior del Kanban, revisa qué región está seleccionada. Si elegiste una región sin iniciativas cargadas, queda vacío.
2. Estás en la vista "Por ministerio" y la región tiene iniciativas pero sin ministerio asignado: el acordeón colapsa todo y parece vacío. Cambia a "Por eje" para ver.
3. Eres regional con scope vacío: si recién te crearon la cuenta y todavía no te asignaron región, vas a ver todo en cero. Escríbenos a ${CONTACTO} para asignar tu scope.

Si ninguna aplica y crees que es un bug, escríbenos con captura de pantalla.`,
    relacionadas: ['cuenta-sin-region', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },

  // ── 6. Minutas e indicadores ─────────────────────────────────────────────
  {
    id: 'minutas-tres-formatos',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: '¿Para qué sirve cada una de las tres minutas?',
    respuesta:
`Cada formato resuelve un escenario distinto:

EJECUTIVA (~2-3 páginas)
- Resumen para una autoridad o reunión corta de gabinete.
- Avance global por eje, alertas críticas, hitos relevantes.
- Úsala cuando alguien te pregunta "¿cómo va la región?" y tienes 5 minutos.

REPORTE COMPLETO (~10-30 páginas)
- Detalle por iniciativa: estado, avance, próximos hitos, inversión, BIP.
- Ideal para enviar a la jefatura o documentar una rendición.
- Pesa más, tarda un poco en generarse.

KIT DE VIAJE (~5-10 páginas, formato imprimible)
- Pensado para llevarte a una reunión presencial (Comité de Crisis, visita de Ministro, gabinete regional).
- Solo lo crítico: foco, alertas, próximos hitos. Listo para imprimir y consultar en mesa.

Genera la que mejor calza con tu caso. Las tres se generan desde el botón "Generar ejecutiva ▾" en Mi Región.`,
    relacionadas: ['minutas-cache', 'minutas-regenerar-regional'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-cache',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: 'Generé una minuta hace un rato y los datos cambiaron, ¿por qué sigue mostrando lo viejo?',
    respuesta:
`Las minutas tienen caché para evitar regenerar el PDF cada vez (es un proceso pesado). Cuando ya existe una versión generada, el botón cambia de "Generar" a "Descargar" — eso significa que está usando la versión cacheada.

Si los datos cambiaron y necesitas la versión actualizada:

- Si eres regional: pídele a un admin/editor que la regenere (botón "Regenerar" solo aparece para ellos).
- Si eres admin/editor: en el menú desplegable del botón aparece "Regenerar ejecutiva/completo/kit". Clic → genera de nuevo con los datos actuales.

El caché se invalida automáticamente si pasan más de 24 horas sin regenerar.`,
    relacionadas: ['minutas-regenerar-regional', 'minutas-tres-formatos'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-regenerar-regional',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: 'El botón dice "Descargar" pero quiero la versión más actualizada, ¿cómo la rehago?',
    respuesta:
`Regenerar es exclusivo de admin/editor. Si necesitas la versión actualizada:

1. Verifica si realmente está desactualizada: descárgala primero y revisa la fecha de generación en el pie de página.
2. Si es de hoy y los cambios que esperabas no aparecen, probablemente esos cambios no fueron aprobados todavía (están en propuesta pendiente) — confirma en "Mis propuestas".
3. Si efectivamente está desactualizada (es de hace varios días), escríbenos para regenerarla: ${CONTACTO}.

Si el regenerar es para algo urgente (ej. reunión en 2 horas), avísanos en el correo y lo priorizamos.`,
    relacionadas: ['minutas-cache', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-historico',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: 'Las minutas que genero ¿quedan guardadas para revisar después?',
    respuesta:
`Sí. Cada minuta generada queda en el caché del panel con su fecha de generación, hasta que se regenere. Puedes volver a descargarla las veces que necesites mientras siga vigente la versión cacheada.

Limitaciones:
- No hay archivo histórico de "minutas anteriores". Si regeneras, se pierde la versión vieja.
- Si necesitas archivar una minuta de una fecha específica (ej. para una auditoría), descárgala y guárdala localmente.

A futuro vamos a habilitar un historial de minutas generadas. Por ahora, descarga + archivo local.`,
    relacionadas: ['minutas-cache'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-personalizar',
    audiencia: 'admin_editor',
    categoria: 'Minutas e indicadores',
    pregunta: '¿Puedo personalizar el formato o portada de una minuta?',
    respuesta:
`Hoy las minutas usan templates fijos: la portada es estándar (logo del Ministerio, nombre de la región, fecha de generación, formato). El contenido se compone automáticamente desde los datos del panel.

Lo que sí puedes hacer:
- Editar el PDF descargado en herramientas externas si necesitas algo puntual (agregar una portada con membrete particular, una nota al lector, etc.).
- Si la personalización es estructural (cambiar campos del template, secciones nuevas), escríbenos y lo evaluamos como mejora.

La intención del panel es que las minutas sean consistentes entre regiones y momentos, así son comparables. Demasiada personalización rompe eso.`,
    relacionadas: ['minutas-tres-formatos'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-regenerar-admin',
    audiencia: 'admin_editor',
    categoria: 'Minutas e indicadores',
    pregunta: '¿Cómo fuerzo regenerar una minuta?',
    respuesta:
`En el menú desplegable del botón "Generar ejecutiva ▾" en Mi Región, hay un sub-item "Regenerar [tipo]" visible solo para admin/editor.

Clic → el sistema descarta el caché y regenera con los datos vigentes en ese momento. Tarda unos segundos.

Cuándo conviene regenerar:
- El regional pidió la versión actualizada (cambios recientes que no se reflejan).
- Hubo una corrección estructural significativa que invalida la versión anterior.
- Antes de una reunión importante, para asegurar que llevas la última foto.

No abuses del regenerar — es pesado. Si los datos no cambiaron, regenerar entrega el mismo PDF y consume recursos.`,
    relacionadas: ['minutas-cache', 'minutas-regenerar-regional'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'minutas-kit-imprimir',
    audiencia: 'admin_editor',
    categoria: 'Minutas e indicadores',
    pregunta: 'El Kit de Viaje ¿se imprime tal cual o hay que editarlo?',
    respuesta:
`Sale listo para imprimir. El template está pensado para gabinete: hoja carta, márgenes adecuados, sin sangrado, fuente legible a tamaño normal de lectura.

Recomendaciones:
- Imprime a doble cara: el Kit típico son 5-10 páginas, queda compacto.
- Lleva 2-3 copias si vas a estar varias personas en la mesa.
- Si la reunión es muy formal, agrega una portada institucional encima (impresa aparte).

Si descubres algo del template que no funciona bien para reuniones reales (campo cortado, sección poco útil), avísanos para iterar.`,
    relacionadas: ['minutas-tres-formatos'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'indicadores-actualizar',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: 'Los indicadores socioeconómicos (pobreza, empleo) ¿los puedo actualizar yo?',
    respuesta:
`No, son datos externos no editables. Se sincronizan automáticamente desde fuentes oficiales:

- Pobreza, ingresos, multidimensional: CASEN (Ministerio Desarrollo Social).
- Desocupación, PIB regional: Banco Central de Chile (BCCh), vía API.
- Seguridad: LeyStop / Fiscalía, según indicador.

La cadencia depende de la fuente: CASEN es anual, BCCh es trimestral o mensual.

Si ves un dato que se ve raro o desactualizado, escríbenos: puede ser un problema del sync. No es algo que tú puedas corregir desde tu lado.`,
    relacionadas: ['indicadores-fuentes', 'indicadores-comparar-regiones'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'indicadores-fuentes',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: '¿De dónde salen los datos de los indicadores y cada cuánto se actualizan?',
    respuesta:
`Cada indicador tiene su fuente y cadencia natural:

- CASEN (pobreza, ingresos): anual. Última disponible: CASEN 2024.
- BCCh (desocupación, PIB): mensual o trimestral. Se sincronizan los lunes a las 7 AM UTC.
- LeyStop (seguridad): semanal.
- SEIA (proyectos ambientales): semanal, lunes 8 AM.
- MOP (proyectos infraestructura): semanal, lunes 9 AM.

En el modal de Indicadores, cada KPI muestra debajo del valor su fuente y la fecha del último dato disponible.

Si la sincronización falla, se queda con el último dato bueno y eso se refleja en la fecha mostrada — no muestra dato falso.`,
    relacionadas: ['indicadores-actualizar', 'indicadores-comparar-regiones'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'indicadores-comparar-regiones',
    audiencia: 'regional',
    categoria: 'Minutas e indicadores',
    pregunta: 'Los indicadores ¿son comparables entre regiones?',
    respuesta:
`Depende del indicador:

COMPARABLES DIRECTOS
- Desocupación (%): misma metodología BCCh para todas las regiones.
- Pobreza CASEN (%): misma encuesta nacional.
- PIB regional (% del nacional): por definición se comparan.

NO TAN COMPARABLES
- Casos de seguridad: las regiones tienen poblaciones muy distintas. El número absoluto engaña; el panel lo muestra como "por 100 mil habitantes" para corregirlo.
- Inversión total: las regiones grandes (RM, Biobío) tienen montos mucho mayores. Compara como % del PIB regional o per cápita.

El modal de Indicadores no muestra el comparativo entre regiones (es per-región). Si necesitas el comparativo, pídelo a un editor — DCI maneja reportes nacionales agregados.`,
    relacionadas: ['indicadores-fuentes', 'permisos-ver-otras-regiones'],
    ultima_revision: '2026-06-08',
  },

  // ── 7. Cuenta y acceso ───────────────────────────────────────────────────
  {
    id: 'cuenta-login-correo',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Con qué correo entro al panel?',
    respuesta:
`Con tu correo institucional del Ministerio del Interior o de la Delegación Presidencial Regional correspondiente. Típicamente termina en @interior.gob.cl.

Si te crearon la cuenta con un correo distinto (gmail, otro dominio), usa ese. Si no sabes con cuál te dieron de alta, escríbenos a ${CONTACTO}.

No hay SSO (single sign-on) con correo institucional todavía — el login es local del panel. Tu contraseña del panel es independiente de la del correo.`,
    relacionadas: ['cuenta-recuperar-password', 'cuenta-sin-region'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-recuperar-password',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: 'Olvidé mi contraseña, ¿cómo la recupero?',
    respuesta:
`Hoy el flujo de recuperación automática no está habilitado. Si olvidaste tu contraseña:

1. Escríbenos a ${CONTACTO} desde tu correo institucional (para verificar identidad).
2. Te enviamos una contraseña temporal al mismo correo.
3. Al entrar, cámbiala por una nueva que recuerdes.

Si sospechas que tu cuenta fue comprometida (alguien usó tu acceso), avísanos inmediatamente para revocar la sesión y resetear.`,
    relacionadas: ['cuenta-login-correo', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-sin-region',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: 'Entré pero no veo ninguna región asignada, ¿qué hago?',
    respuesta:
`Significa que tu cuenta existe pero no tienes scope asignado. El panel arranca en el mapa y todas las regiones aparecen sin acceso.

Posibles motivos:
- Eres regional y todavía no te asignaron tu(s) región(es). Solución: escríbenos con tu correo y a qué delegación perteneces, te asignamos el scope.
- Eres viewer en transición de rol. Probablemente fue temporal.
- Te asignaron mal el rol (eres regional pero te marcaron como viewer). Lo confirmamos al revisar.

Escríbenos a ${CONTACTO} y lo resolvemos en el día.`,
    relacionadas: ['cuenta-contacto-dci', 'permisos-roles-existentes'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-cambio-delegacion',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: 'Me cambiaron de delegación, ¿cómo actualizo la región que tengo asignada?',
    respuesta:
`Tú no puedes cambiar tu propio scope — lo gestiona un admin. Escríbenos a ${CONTACTO} con:

- Tu correo de cuenta.
- Delegación anterior (de qué región te vas).
- Delegación nueva (a qué región vas).
- Fecha efectiva del cambio.

Un admin actualiza tu region_cods y al próximo refresh ves tu nueva región como "tu cartera".

Si todavía tienes pendientes en la delegación anterior, coordina con el equipo entrante para no dejar cabos sueltos antes del corte.`,
    relacionadas: ['cuenta-sin-region', 'permisos-admin-cambiar-rol'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-multi-region',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Puedo tener una misma cuenta para dos regiones a la vez?',
    respuesta:
`Sí. El campo region_cods es un array, soporta múltiples regiones en una misma cuenta. Es útil para macrozonas (alguien que coordina Arica + Tarapacá + Antofagasta) o transiciones (mientras cambias de delegación tienes acceso a ambas).

Para asignarte multi-región, escríbenos con la lista exacta de regiones. Un admin actualiza tu scope.

Cuando tienes varias regiones: el mapa te muestra todas las tuyas seleccionables; en Mi Región eliges con un selector cuál ver activa; el Dashboard agrega todas tus regiones.`,
    relacionadas: ['cuenta-cambio-delegacion', 'permisos-admin-crear-usuario'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-contacto-dci',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Con quién en DCI me contacto si algo no anda o necesito un cambio?',
    respuesta:
`Escríbenos a ${CONTACTO}.

Qué incluir para que te respondamos rápido:
- Tu nombre, región y rol.
- Descripción concreta del problema o la solicitud.
- Si es un error técnico: pasos para reproducirlo y captura de pantalla si puedes.
- Si es urgente: pónlo en el asunto ("URGENTE - [tu región] - ...").

Horario de respuesta esperado: días hábiles, mismo día para temas urgentes. Para algo no urgente, 24-48 horas.

Para temas estructurales (cambio de rol, alta de eje, regenerar minuta), también puedes coordinar directo con tu contraparte habitual en DCI.`,
    relacionadas: [],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-mobile',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿El panel se puede usar desde el celular?',
    respuesta:
`Técnicamente sí, en términos de que entra y se ve. Funcionalmente está pensado para desktop o tablet — las vistas con muchas columnas (Dashboard, Kanban, ficha) son incómodas en pantalla chica.

Lo que sí funciona bien en móvil:
- Login.
- Mapa (ver tu región y abrir el panel lateral).
- Mi Región (header, alertas, semáforo).
- Bandeja de Atención (lista vertical).
- Marcar/desmarcar foco con la bandera.
- Centro de Ayuda y FAQ.

Lo que conviene hacer en desktop:
- Carga del Excel semanal (es para Excel, no para móvil).
- Edición masiva en la ficha.
- Generar y descargar minutas.

Una app móvil dedicada está fuera de scope por ahora.`,
    relacionadas: [],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-panel-caido',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Qué hago si el panel está caído o muy lento?',
    respuesta:
`Pasos rápidos:

1. Refresca con Ctrl+R (o Cmd+R en Mac). Resuelve el 70% de los casos.
2. Cierra sesión y vuelve a entrar. Ayuda cuando tu token de sesión está raro.
3. Prueba en otro navegador. Si solo falla en uno, es probablemente caché local; vacíala.
4. Si nada de lo anterior funciona, escríbenos a ${CONTACTO} con: hora exacta del problema, qué intentabas hacer, qué error mostró el navegador (si lo hubo).

Notamos que el panel se cae: te avisamos por correo cuando se restablece. Si tienes una entrega contra reloj, escríbenos igual para ver si podemos resolverlo en paralelo.`,
    relacionadas: ['cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-seguridad-datos',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Mis datos están seguros? ¿Hay backups?',
    respuesta:
`Sí. El panel está hospedado en infraestructura cloud con cifrado en tránsito (HTTPS) y en reposo. Solo usuarios autenticados pueden acceder.

Protecciones a nivel del producto:
- Cada acceso queda registrado con email y timestamp.
- Las acciones que modifican datos quedan en log de auditoría por iniciativa (pestaña "Historial").
- Los archivos Excel se borran del Storage después de aprobada/rechazada/cancelada la propuesta.
- Backups automáticos diarios, retenidos por 30 días.

Si tienes una preocupación específica de seguridad o privacidad (ej. compartir el acceso con alguien externo), escríbenos antes de hacerlo.`,
    relacionadas: ['cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-exportar-historial',
    audiencia: 'regional',
    categoria: 'Cuenta y acceso',
    pregunta: '¿Puedo exportar todo el historial de mi cartera para análisis externo?',
    respuesta:
`Sí, con dos caminos según lo que necesites:

DATOS ACTUALES (snapshot del momento)
- Desde el Kanban → botón "Descargar cartera" → Excel completo de la región.
- Desde el Dashboard → botón "⬇️ Excel" → tabla filtrada según los filtros activos.

DATOS HISTÓRICOS (cambios en el tiempo)
- Por iniciativa: pestaña "Historial" en la ficha muestra log de cambios. Hoy se ve en pantalla, no se exporta en bloque.
- Para una exportación histórica masiva (ej. comparar enero vs junio), escríbenos: lo armamos a medida desde la base de datos.

A futuro vamos a habilitar exportación histórica autoservicio. Por ahora, snapshot self-service + histórico a pedido.`,
    relacionadas: ['cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
  {
    id: 'cuenta-integraciones',
    audiencia: 'todos',
    categoria: 'Cuenta y acceso',
    pregunta: '¿El panel se va a integrar con otros sistemas (DIPRES, MIDESO, etc.)?',
    respuesta:
`Hoy hay integraciones automáticas con fuentes de datos contextuales:
- Banco Central de Chile (BCCh): desocupación, PIB regional.
- SEIA (Sistema de Evaluación de Impacto Ambiental): proyectos.
- MOP: proyectos de obras públicas.
- CASEN (vía importación periódica): pobreza, indicadores socioeconómicos.

En evaluación / roadmap:
- BIP del MIDESO: hoy se carga el código BIP manualmente; el plan es traer estado y monto automático.
- DIPRES: para conciliar ejecución presupuestaria con avance reportado.

Si tu equipo o un ministerio identifica una integración que ahorraría trabajo, escríbenos — las priorizamos según uso real.`,
    relacionadas: ['indicadores-fuentes', 'cuenta-contacto-dci'],
    ultima_revision: '2026-06-08',
  },
]

/**
 * Filtra el catálogo por las capabilities del usuario actual. La API
 * recibe lo que ya expone UserContext (isAdmin, canEditAny) para no
 * obligar a propagar el `role` string a todos los consumidores.
 *
 * Mapeo de audiencias:
 * - 'todos'        → siempre visible
 * - 'admin'        → solo isAdmin
 * - 'admin_editor' → canEditAny (admin OR editor)
 * - 'regional'     → cualquier no-admin/editor (incluye regional y viewer)
 */
export function faqsVisibles(
  catalog: FaqEntry[],
  caps: { isAdmin: boolean; canEditAny: boolean }
): FaqEntry[] {
  return catalog.filter(f => {
    switch (f.audiencia) {
      case 'todos':        return true
      case 'admin':        return caps.isAdmin
      case 'admin_editor': return caps.canEditAny
      case 'regional':     return !caps.canEditAny
      default:             return false
    }
  })
}
