# FAQ Discovery — output del sub-agente · 2026-06-08

54 preguntas generadas. Distribución: regional=32, admin_editor=10, admin=5, todos=7.
Categoría con más preguntas: Carga semanal (16).

Este archivo es la fuente para redactar las respuestas. Cuando una FAQ
quede cargada en `lib/faq.ts`, marcarla con ✓ al final de la línea de
pregunta. Si se descarta una, marcarla con ✗ y un motivo breve.

---

## 1. Carga semanal

### regional
- **¿Dónde descargo el Excel pre-llenado de mi región?**
  - *contexto:* ubicar el botón de descarga, primer paso del flujo semanal.
- **¿Tengo que llenar todas las celdas del Excel o solo las que cambiaron esta semana?**
  - *contexto:* duda sobre si el sistema sobrescribe o hace diff.
- **Subí el Excel y no veo los cambios reflejados en mi cartera, ¿qué pasó?**
  - *contexto:* no entienden que la propuesta queda pendiente de aprobación.
- **¿Cómo sé si mi propuesta ya fue revisada?**
  - *contexto:* dónde mirar el estado (Mis propuestas).
- **Mi propuesta quedó "Aplicada con avisos", ¿qué significa y qué tengo que hacer?**
  - *contexto:* algunas filas fallaron, hay que identificarlas y reenviarlas.
- **Me rechazaron la propuesta, ¿dónde leo el motivo?**
  - *contexto:* la nota obligatoria del admin vive en el detalle de la propuesta.
- **Si me rechazan una propuesta, ¿tengo que rehacer el Excel desde cero o puedo corregir solo lo que falló?**
  - *contexto:* reaprovechar el archivo vs. volver a descargarlo.
- **¿Puedo cancelar una propuesta que ya envié si me equivoqué?**
  - *contexto:* gestión del estado Pendiente antes de revisión admin.
- **El Excel me marca error de "eje no existe en el catálogo", ¿qué hago?**
  - *contexto:* el bloqueo previo a subir; flujo de pedir alta de eje a DCI.
- **¿Por qué el Excel no me deja cambiar el ministerio o el código BIP de una iniciativa?**
  - *contexto:* campos estructurales bloqueados por modelo de permisos.
- **¿Cada cuánto tengo que subir la actualización?**
  - *contexto:* cadencia esperada (semanal) y expectativas DCI.
- **Si edito el semáforo directo en la ficha, ¿también tengo que subirlo en el Excel?**
  - *contexto:* convivencia entre edición en línea y carga masiva.

### admin
- **¿Cómo apruebo o rechazo una propuesta de un regional?**
  - *contexto:* flujo de revisión y nota obligatoria al rechazar.
- **Al rechazar, ¿la nota le llega al regional por correo o solo la ve dentro del panel?**
  - *contexto:* canal de comunicación de feedback.
- **¿Puedo aprobar solo algunas filas de una propuesta y descartar las que tienen error?**
  - *contexto:* origen del estado "Aplicada con avisos".
- **¿Dónde veo todas las propuestas pendientes de todas las regiones?**
  - *contexto:* bandeja central de revisión.

## 2. Permisos y roles

### regional
- **¿Por qué no puedo cambiar el eje de una iniciativa si yo soy quien la conoce?**
  - *contexto:* anti-pattern clásico, modelo estructural vs. operativo.
- **¿Qué campos sí puedo editar directo en la ficha sin pasar por Excel?**
  - *contexto:* listar lo operativo (semáforo, avance, responsable, seguimientos, foco, documentos).
- **¿Puedo ver iniciativas de otras regiones para comparar?**
  - *contexto:* scoping por región, expectativa de visibilidad nacional.
- **¿Cómo pido que me agreguen un eje nuevo a mi catálogo?**
  - *contexto:* canal para pedir alta de eje a admin/editor.

### admin_editor
- **¿Puedo editar una iniciativa de cualquier región o solo de algunas?**
  - *contexto:* alcance del rol editor central.
- **¿Por qué no puedo aprobar propuestas si soy editor?**
  - *contexto:* aprobar es exclusivo de admin.
- **¿Puedo crear usuarios nuevos para una delegación regional?**
  - *contexto:* gestión de usuarios es admin-only.

### admin
- **¿Cómo asigno un usuario nuevo a una región?**
  - *contexto:* alta de regional y asignación de scope.
- **¿Cómo cambio el rol de un usuario (de regional a editor, por ejemplo)?**
  - *contexto:* gestión de usuarios.

## 3. Ejes

### regional
- **¿Dónde veo los ejes oficiales de mi región?**
  - *contexto:* catálogo formal region_ejes, hoja "Ejes válidos" del Excel.
- **El Excel que armó otro ministerio trae un eje que no está en mi catálogo, ¿lo puedo agregar yo?**
  - *contexto:* solo admin/editor crea ejes, el regional pide alta.
- **¿Cómo tengo que escribir el nombre del eje para que el Excel no me dé error?**
  - *contexto:* formato canónico "Eje N: Nombre" con dos puntos.

### admin_editor
- **¿Cómo creo un eje nuevo para una región?**
  - *contexto:* gestión del catálogo region_ejes.
- **¿Puedo renumerar o renombrar un eje sin romper las iniciativas que ya lo referencian?**
  - *contexto:* impacto de cambios sobre FK eje_id.
- **¿Qué pasa si elimino un eje que ya tiene iniciativas asociadas?**
  - *contexto:* validación e implicancias.

## 4. Métricas y PREGO

### regional
- **¿Dónde reporto el valor actual de las métricas de mi región?**
  - *contexto:* ubicación del input semanal por métrica.
- **La meta de una métrica está mal, ¿la puedo corregir yo?**
  - *contexto:* admin/editor define meta, regional reporta valor.
- **Veo "PREGO 3/9" en Mi Región pero no encuentro dónde abrir las fases, ¿dónde está?**
  - *contexto:* el regional ve el contador pero no la vista, es admin/editor only.
- **¿Cuál es la diferencia entre una métrica de eje y el % de avance de una iniciativa?**
  - *contexto:* compromiso programático (meta agregada) vs. progreso por iniciativa.

### admin_editor
- **¿Cómo defino una métrica nueva para un eje?**
  - *contexto:* alta de métrica + meta.
- **¿Cómo avanzo a la región a la siguiente fase del PREGO?**
  - *contexto:* operación de las 9 fases.
- **¿El regional recibe alguna notificación cuando avanzo la fase PREGO?**
  - *contexto:* visibilidad del cambio del lado regional.

## 5. Atención y foco

### regional
- **¿Cómo marco una iniciativa en foco?**
  - *contexto:* ubicación del botón/bandera en ficha y card.
- **Marqué algo en foco y desapareció de la bandeja, ¿qué pasó?**
  - *contexto:* probablemente la desmarcaron al cliquear la bandera de nuevo.
- **¿La bandeja de atención la ven los otros del equipo de mi región o solo yo?**
  - *contexto:* foco es compartido a nivel región, no personal.
- **¿Qué son las "Sugerencias automáticas" de la bandeja y con qué criterio aparecen?**
  - *contexto:* lógica detrás de la sugerencia, para que confíen o no.
- **¿Puedo descartar una sugerencia automática para que no me la siga proponiendo?**
  - *contexto:* gestión del ruido en la sección colapsable.
- **¿Cuántas iniciativas puedo tener en foco al mismo tiempo?**
  - *contexto:* si hay límite recomendado para que la bandeja siga siendo útil.

### todos
- **¿Cuál es la diferencia entre el semáforo y el % de avance?**
  - *contexto:* semáforo es juicio (verde/amarillo/rojo/gris), avance es progreso numérico.
- **El Kanban se ve vacío, ¿por qué?**
  - *contexto:* filtro mal seleccionado o región sin iniciativas cargadas.

## 6. Minutas e indicadores

### regional
- **¿Para qué sirve cada una de las tres minutas (Ejecutiva, Reporte Completo, Kit de Viaje)?**
  - *contexto:* aclarar el caso de uso de cada formato.
- **Generé una minuta hace un rato y los datos cambiaron, ¿por qué sigue mostrando lo viejo?**
  - *contexto:* la minuta tiene caché, hay que regenerar.
- **El botón de la minuta dice "Descargar" pero quiero la versión actualizada, ¿cómo la rehago?**
  - *contexto:* admin/editor puede forzar Regenerar, el regional no.
- **¿Los indicadores socioeconómicos que veo (pobreza, empleo) los puedo actualizar yo?**
  - *contexto:* son contexto CASEN/externo, no editables por el regional.
- **¿De dónde salen los datos de los indicadores y cada cuánto se actualizan?**
  - *contexto:* fuentes (CASEN, BCCh) y cadencia de sync.

### admin_editor
- **¿Cómo fuerzo regenerar una minuta si los datos quedaron desactualizados?**
  - *contexto:* botón Regenerar exclusivo de admin/editor.
- **El Kit de Viaje, ¿se imprime tal cual o tengo que ajustarlo antes de la reunión?**
  - *contexto:* expectativa del formato imprimible.

## 7. Cuenta y acceso

### todos
- **¿Con qué correo entro al panel?**
  - *contexto:* correo institucional, sin SSO.
- **Olvidé mi contraseña, ¿cómo la recupero?**
  - *contexto:* flujo de recuperación.
- **Entré pero no veo ninguna región asignada, ¿qué hago?**
  - *contexto:* usuario sin scope, contactar a admin DCI.
- **Me cambiaron de delegación, ¿cómo actualizo la región que tengo asignada?**
  - *contexto:* cambio de scope, lo gestiona admin.
- **¿Puedo tener una misma cuenta para dos regiones?**
  - *contexto:* multi-región a nivel usuario.
- **¿Con quién en DCI me contacto si algo no anda o necesito un cambio que no puedo hacer yo?**
  - *contexto:* canal de soporte / contacto humano.
- **¿El panel se puede usar desde el celular?**
  - *contexto:* expectativa de uso móvil en terreno.
