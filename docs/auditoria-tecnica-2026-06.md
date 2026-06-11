# Auditoría técnica — Work OS (PSG)

**Fecha:** 11 de junio de 2026
**Alcance:** arquitectura de datos, arquitectura de código, capa visual/UX, confiabilidad y seguridad.
**Objetivo:** dejar las bases sólidas *antes* de seguir creciendo. El proyecto hoy son ~35.700 líneas, 58 componentes, 29 rutas API, 22 migraciones, 16 regiones y 63 prioridades territoriales — y va a seguir sumando módulos (Desalojos, indicadores, etc.).

> **Cómo leer este documento.** Cada hallazgo trae: dónde está (`archivo:línea`), *por qué importa* en lenguaje simple, y qué tan caro es arreglarlo. Al final hay una matriz de priorización con puntaje y un plan por fases que se puede hacer en paralelo a las features. El glosario (Apéndice B) explica los términos técnicos.

---

## 1. Veredicto en una página

Work OS está **bien construido para lo que es hoy** y mal preparado para lo que va a ser. La base tiene disciplina poco común en proyectos de una sola persona: TypeScript estricto, migraciones versionadas, separación limpia de clientes Supabase, control de roles, registros de auditoría y hasta decisiones documentadas en tu bóveda. Eso es capital real y no hay que romperlo.

El problema no es la calidad del código línea a línea. Es **estructural**, y tu intuición es correcta: hay dos modelos de datos coexistiendo (el "v1" original y el "v2" nuevo, que es el bueno), la identidad de una región se representa de cuatro maneras distintas según la tabla, la autorización de quién-puede-editar vive en el navegador y no en la base, y no hay red de seguridad (cero tests, errores que fallan en silencio, casi nula observabilidad). Ninguno de esos cuatro es urgente *hoy*; los cuatro se vuelven caros y peligrosos a medida que entran más usuarios, más módulos y más datos.

La recomendación de fondo: **dedicar una "fase de consolidación" corta antes del próximo módulo grande.** No es reescribir nada — es terminar migraciones que quedaron a medias, mover tres o cuatro decisiones de seguridad del cliente a la base, y poner una red mínima de tests y monitoreo. Es la diferencia entre que el crecimiento se apoye en cimientos o sobre andamios.

**Top 5 por prioridad (detalle y puntaje en la sección 7):**

1. 🔴 **Autorización solo del lado del cliente** — cualquier usuario con sesión puede editar cualquier prioridad escribiendo directo a la base; el límite "solo admin/editor" solo existe en la interfaz.
2. 🟠 **Cero observabilidad** — la sincronización de SEIA estuvo 53 días caída sin que nadie se enterara. Es barato de arreglar y de alto valor.
3. 🟠 **Dos modelos de datos en paralelo (v1 + v2)** — la raíz de tu sospecha sobre la arquitectura de datos.
4. 🟠 **Sin tests y errores silenciosos** — el bug de RLS del 29-may (datos que se perdían sin avisar) es el síntoma, no la causa.
5. 🟡 **Identidad de región inconsistente** — `region`, `cod`, `region_cod`, `region_id` conviven como llaves distintas para la misma cosa.

---

## 2. Alcance y una limitación honesta

Esta auditoría leyó **todo el código fuente, las 22 migraciones SQL, la configuración de despliegue y tu bóveda de Obsidian** para entender el uso real.

**Lo que no pude hacer:** consultar la base Supabase en vivo. El entorno sandbox desde donde trabajo no tiene salida de red (no resuelve DNS, ni siquiera a dominios conocidos), así que el esquema de datos lo *reconstruí* desde las migraciones + `lib/db.ts` + `lib/types.ts`. Esa reconstrucción es fiable para estructura, nombres y relaciones, pero no me deja medir cosas que solo viven en los datos: cuántas filas hay, si hay huérfanos por las claves foráneas lógicas, o el volcado real de las políticas RLS activas.

Por eso el **Apéndice A** trae un set de consultas SQL de *solo lectura* listas para pegar en el editor SQL de Supabase. Te toma cinco minutos y cierra esa parte de la auditoría con datos reales. Como alternativa, podemos conectar un conector de Postgres/Supabase en una próxima sesión y lo corro yo.

---

## 3. Fortalezas (lo que NO hay que tocar)

Vale la pena nombrarlas para no romperlas durante el refactor y para calibrar: este no es un proyecto en problemas, es un proyecto bueno que necesita madurar su estructura.

- **TypeScript estricto y bien tipado.** `strict: true`, y el dominio está modelado con cuidado en `lib/types.ts` (671 líneas, con comentarios que explican el *porqué* de cada campo). Solo **9 usos de `any` en 3 archivos** en toda la base — eso es excelente disciplina.
- **Migraciones versionadas y secuenciales** (`001`…`022`), idempotentes en su mayoría. Tienes historia reproducible de cómo evolucionó el esquema.
- **Separación de clientes Supabase impecable.** `lib/supabase.ts` (navegador, anon) vs `lib/supabaseServer.ts` (servidor, service-role) con advertencias en comentarios para no mezclarlos. Es el patrón correcto.
- **Control de acceso por roles** (admin/editor/regional/viewer) con cierre de sesión por inactividad y `proxy.ts` que protege rutas y agrega cabeceras de seguridad.
- **Registros de auditoría** (`semaforo_log`, `desalojo_log`) — buena previsión.
- **El modelo "v2" es buen diseño.** Catálogo + valores + vista materializada (`v2_indicadores_ultimo`) es exactamente como se modelan indicadores que escalan. El problema (sección 4) no es el v2; es que el v1 sigue vivo al lado.
- **Disciplina de documentación** en la bóveda: registros de decisión, sesiones, aprendizajes. Poca gente lo hace.

---

## 4. Arquitectura de datos — el hallazgo de fondo

Aquí está el grueso de tu intuición. Lo separo en cuatro problemas relacionados.

### 4.1 Dos modelos de datos coexistiendo (v1 y v2) 🟠

El proyecto está a mitad de una migración de esquema que nunca se terminó. Conviven:

- **Modelo v1:** `prioridades_territoriales`, `seia_projects`, `mop_projects`, `region_metrics` (formato ancho), `regional_metrics` (formato largo).
- **Modelo v2:** `v2_iniciativas`, `v2_proyectos_inversion`, `v2_indicadores_catalogo` + `v2_indicadores_valores` + vista `v2_indicadores_ultimo`, `v2_regiones`, `v2_ministerios`, etc.

Las sincronizaciones escriben a **ambos a la vez** ("dual-write"). Por ejemplo en `app/api/seia-sync/route.ts:135-159`: primero hace `upsert` a `seia_projects` y luego, por separado, a `v2_proyectos_inversion`. Lo mismo en `mop-sync`, `ine-sync`, `pib-sync`, `stop-sync`.

**Por qué importa.** Tres costos concretos: (1) cada escritura son dos operaciones sin transacción que las una — si la primera funciona y la segunda falla, las dos tablas quedan en desacuerdo y nadie se entera (ver 6.3); (2) cada feature nueva obliga a decidir "¿leo de v1 o de v2?" y a mantener dos caminos; (3) duplica el almacenamiento y multiplica la superficie donde un dato puede quedar inconsistente. Esto es deuda que *crece con cada sync y cada módulo*, justo lo que quieres evitar.

**Hacia dónde.** No hay que elegir un modelo nuevo: ya elegiste, es el v2. La tarea es *terminar de migrar las lecturas a v2, congelar v1, y luego eliminarlo*. Es trabajo acotado y de altísimo retorno. Lo detallo en el plan (fase 1).

### 4.2 La identidad de una región se representa de 4 maneras 🟡

La misma entidad —una región— aparece como llave distinta según la tabla:

- `region` → el **nombre** en texto (`"Biobío"`), usado como llave para agrupar en `WorkOSApp.tsx:256` y para hacer *join* en memoria.
- `cod` / `region_cod` → el **código** (`"BIO"`), usado en `prioridades_territoriales`, `region_metrics`, rutas `/api/metrics/[cod]`.
- `region_id` → un **entero** (0–16) en `regional_metrics` y `v2_indicadores_valores`, mapeado a mano en `lib/regions.ts` (`INE_CODE`).

Y conviven con la trampa documentada en `CLAUDE.md`: `region_id = 0` es válido (nivel nacional) pero es *falsy*, así que hay que comparar con `=== undefined` y no con `!region_id`. Eso es una mina enterrada esperando al próximo que escriba el chequeo "obvio".

**Por qué importa.** Cada vez que cruzas datos de dos tablas tienes que traducir entre nombre ↔ código ↔ id, casi siempre **en memoria en el cliente** en vez de con un *join* en la base. Es más código, más lento, y cada traducción es una oportunidad de bug (una tilde en "Biobío", un código en minúscula). Con 16 regiones se aguanta; con más fuentes y más módulos se vuelve frágil.

**Hacia dónde.** Una sola tabla canónica de regiones (ya existe: `v2_regiones`) con su `id`, `cod` y `nombre`, y que *todo* la referencie por `id` con clave foránea real. El nombre y el código se obtienen por *join*, no se copian.

### 4.3 Tres formas de guardar indicadores regionales 🟡

`region_metrics` es una tabla **ancha**: 16 filas × ~90 columnas estáticas (`getMetricsSummaryByCod` en `lib/db.ts:226-250` lista una treintena a mano). `regional_metrics` es **larga** (`region_id, metric_name, value, period`). Y `v2_indicadores_valores` es **larga y mejor** (con catálogo, criticidad, frecuencia esperada).

**Por qué importa.** Una tabla ancha de 90 columnas significa que agregar un indicador = una migración `ALTER TABLE` y tocar el `SELECT` a mano; las consultas piden columnas hardcodeadas y rompen en silencio si una falta. El formato largo del v2 resuelve exactamente esto. De nuevo: el destino ya existe, falta converger.

### 4.4 Llave de negocio usada como llave de mutación 🟡

`prioridades_territoriales` se actualiza por `n` (el número 1…63): `ProjectTrackerModal.tsx:129,149,163,175…` hace `.update(...).eq('n', prioridad.n)`. La tabla *también* tiene `id`. Tus propias notas dicen que la llave "real" pensada es `codigo_iniciativa` (formato `XX-NNN-NNN-NNN`), aún sin poblar.

**Por qué importa.** `n` es un número de orden de negocio. El día que se reordene, se inserte una prioridad en el medio o se renumere, todas las referencias por `n` apuntan a la fila equivocada — sin error, solo datos cruzados. Las mutaciones deberían ir contra una llave estable (`id`), nunca contra un número que un humano podría reasignar.

### 4.5 Naming mezclado español/inglés

`prioridades_territoriales` (es) junto a `seia_projects` / `mop_projects` (en) junto a `v2_proyectos_inversion` (es). Menor, pero suma carga cognitiva. Al consolidar v2, vale fijar una convención (sugiero español, que es el dominio) y quedarse con ella.

---

## 5. Seguridad y autorización

### 5.1 🔴 La autorización "solo admin/editor" vive en el cliente, no en la base

Este es el hallazgo más importante de toda la auditoría.

Las ediciones en línea (semáforo, % avance, ministerio, responsable, inversión, tags, "en foco") se escriben **directo desde el navegador** con la llave anónima:

- `ProjectTrackerModal.tsx:163` → `getSupabase().from('prioridades_territoriales').update({ estado_semaforo })...`
- `ProjectTrackerModal.tsx:815` → `...update({ inversion_mm })...`
- `KanbanView.tsx:371` y `AttentionTray.tsx:336` → `...update({ en_foco })...`

Quién puede hacer eso se decide en la interfaz: `WorkOSApp.tsx:63-66` (`canEditRegion` devuelve true solo para admin/editor) y se esconden los botones para los demás. Pero según el incidente documentado en tu bóveda (29-may), la política RLS que habilitó esos UPDATE es del tipo `authenticated_write USING (auth.uid() IS NOT NULL)` — es decir, **autoriza a cualquier usuario con sesión, sin mirar el rol**. Las tablas operativas (`seguimientos`, `documentos_prioridad`) lo hacen explícito en `013_operacional_rls.sql:32-34`: `auth.role() = 'authenticated'`, y la "propiedad" (editar lo propio vs. lo ajeno) se controla *comparando el email en el cliente*.

**Por qué importa.** Un usuario `regional` o `viewer` —que en la interfaz es de solo lectura— puede abrir la consola del navegador y ejecutar un `update` sobre cualquiera de las 63 prioridades, o un `delete` sobre seguimientos ajenos. La interfaz se lo esconde; la base se lo permite. No es una vulnerabilidad expuesta a internet (todo está detrás de login ministerial), pero sí es una **brecha de autorización interna**: el control de acceso es decorativo mientras no esté en RLS. Para una herramienta que va a sumar usuarios de regiones y contrapartes, esto hay que cerrarlo antes de crecer, no después.

**Hacia dónde (dos opciones, no excluyentes):**
- **A — RLS por rol (más correcto):** que las políticas de UPDATE/DELETE consulten el rol del usuario en `user_profiles`, no solo que tenga sesión. Así la base impone la misma regla que la interfaz.
- **B — Escrituras vía API (más control):** que las mutaciones sensibles pasen por una ruta `app/api/...` que valide rol y entrada (con `zod`) usando el cliente service-role, igual que ya haces para Desalojos y propuestas. El navegador deja de escribir directo.

> Para *confirmar* el estado real de las políticas, corre la consulta de `pg_policies` del Apéndice A. Si aparece alguna política con `USING (true)` o `auth.uid() IS NOT NULL` en una tabla de escritura, ahí está la brecha.

### 5.2 Secretos y configuración — esto está bien

Revisé: `.env.local` y `.env.example` **no están en git** (`.gitignore` los excluye, `git ls-files` lo confirma, sin rastro en el historial). Bien. Las variables sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `BCCH_PASS`, `ANTHROPIC_API_KEY`) son todas de servidor. Lo único expuesto al navegador son las `NEXT_PUBLIC_*` (URL + anon key), que es lo esperado.

Dos observaciones menores: (1) aparece un segundo proyecto Supabase (`NEXT_PUBLIC_SUPABASE_COLEGA_URL/ANON`, leído por `lib/hooks/useColegaSeguridad.ts`) — otra fuente de datos en el navegador que conviene documentar y tener en el radar de RLS; (2) las líneas `COLEGA` están duplicadas en `.env.local`, inofensivo pero vale limpiar.

### 5.3 Validación de entrada en rutas API

Las rutas de sincronización validan el `CRON_SECRET` (bien, 17 rutas lo hacen vía `isAuthorizedSync`). Pero no vi una librería de validación de esquemas (`zod` o similar) para los *cuerpos* de las rutas que reciben datos del cliente (propuestas, desalojos, minuta). Hoy se confía en TypeScript, que **no valida en tiempo de ejecución**. Al mover escrituras a API (5.1-B), validar la entrada con `zod` debería ir en el mismo paquete.

---

## 6. Arquitectura de código y confiabilidad

### 6.1 Componentes monolíticos ("god components") 🟡

Los archivos más grandes concentran demasiada responsabilidad:

| Archivo | Líneas |
|---|---|
| `lib/faq.ts` | 1.478 (contenido, ok) |
| `components/NationalDashboard.tsx` | 1.473 |
| `components/KanbanView.tsx` | 1.097 |
| `components/VistaRegional.tsx` | 1.064 |
| `components/ProjectTrackerModal.tsx` | 980 |
| `lib/desalojos.ts` | 977 |
| `components/IndicadoresModalV2.tsx` | 866 |
| `components/AttentionTray.tsx` | 788 |

**Por qué importa.** Un componente de 1.400 líneas mezcla obtención de datos, filtros, cálculos y render. Es difícil de leer, casi imposible de testear por partes, y cada cambio arriesga romper algo no relacionado. No es urgente, pero cada feature nueva dentro de estos archivos cuesta más que la anterior. Conviene descomponerlos *cuando los toques*, no en un gran refactor de golpe.

### 6.2 Estado, *prop drilling* y duplicación

El patrón general (todo el estado en `WorkOSApp`, mutaciones que vuelven por `onUpdatePrioridad` y se propagan a las 4 vistas sin recargar) es **razonable y funciona**. Dos arrugas:

- **Prop drilling:** `onUpdatePrioridad` viaja `WorkOSApp → ProjectsPanel → … → ProjectTrackerModal` (3–4 niveles). Ya empezaste a resolverlo bien con `UserProvider` (Context) para los permisos — el mismo patrón serviría para las mutaciones.
- **Lógica de semáforo duplicada:** `SEMAFORO_CONFIG` está definido en `lib/config.ts:4` *y otra vez* en `NationalDashboard.tsx:22`, además de cálculos RAG (rojo/ámbar/verde) repetidos en `WorkOSApp.tsx:278-300`, KanbanView, AttentionTray, ProjectsPanel. **Por qué importa:** el día que cambie un color o un umbral, hay que acordarse de cambiarlo en 4 lugares; el que se olvide, queda inconsistente. Es un arreglo barato (centralizar en `lib/config.ts` y que todos importen) y de buen retorno.

### 6.3 Errores que fallan en silencio 🟠

Varias mutaciones del cliente no revisan el resultado: `ProjectTrackerModal.tsx:175,185,196,310,589,815` hacen `await getSupabase().from(...).update(...)` y siguen sin mirar si hubo error. El **bug del 29-may** (el flag "en foco" no persistía pero la interfaz mostraba éxito) es exactamente este patrón: Supabase devuelve `200 OK` con `data: []` cuando RLS bloquea, y sin un `.select()` posterior el código no se entera. Tú ya documentaste el patrón defensivo correcto — falta aplicarlo en todos lados. Para feedback al usuario hay **34 `window.alert` en 8 archivos**, que es funcional pero tosco; un sistema de *toast* unificado mejora UX y centraliza el manejo de errores.

### 6.4 Sin tests 🟠

No hay suite de pruebas (lo confirma `CLAUDE.md`: "validar con `npm run build`"). Para 35K líneas que ya son herramienta de decisión ministerial, esto es la red de seguridad que falta. No propongo cobertura total — propongo tests donde más duele: `lib/db.ts` (mapeos), los *parsers* de import/Excel (`lib/importParser.ts`, 551 líneas de lógica frágil), la fecha BCCh `DD-MM-YYYY`, y las políticas RLS (un test que confirme que un `viewer` *no* puede escribir cerraría 5.1 con evidencia).

### 6.5 Sin tiempo real / "el último que guarda, gana"

La página carga las 63 prioridades al inicio y todo pasa a estado local del cliente (`page.tsx` → `WorkOSApp`). No hay sincronización en vivo (Supabase Realtime). **Por qué importa:** si Cote y tú editan la misma prioridad a la vez, el segundo en guardar pisa al primero sin aviso. Con un equipo chico y edición esporádica casi no se nota; con la DCI central + regiones entrando, se va a notar. Supabase Realtime resuelve esto con poco código.

### 6.6 Sincronización SEIA por sobre el límite de la plataforma 🟠

`CLAUDE.md` documenta que el sync completo de SEIA tarda **~340 s**, pero el límite de Vercel (y el `maxDuration` configurado en `seia-sync/route.ts:31`) es **300 s**. Es decir, en el peor caso la función se corta antes de terminar — y el incidente de "53 días de silencio" sugiere que ya pasó. **Por qué importa:** un sync que estructuralmente no cabe en su ventana es una bomba de tiempo. La solución no es subir el número (300 es el techo): es *trocear* el trabajo (por región, reanudable) o moverlo a una cola/cron externo. `mop-sync` (~150 s) y `stop-sync` hoy tienen holgura bajo los 300 s, pero comparten el mismo patrón frágil: si su volumen crece, caen en lo mismo. Conviene trocearlos de una vez por diseño.

### 6.7 Observabilidad casi nula 🟠

Lo único que reporta estado es la tabla `sync_status`. No hay rastreo de errores (tipo Sentry) ni alertas. Por eso una caída de 53 días pasó inadvertida. **Es de los arreglos más baratos y de mayor retorno de toda la lista:** una integración de error-tracking + una alerta simple ("si un sync no corre hace > X días, avísame") y dejas de auditar a ciegas.

---

## 7. Capa visual y sistema de diseño

La interfaz es limpia y consistente a la vista (paleta slate/blue, tarjetas, modales unificados — tu commit `4946528` lo confirma). Las observaciones son de *escala*, no de estética:

- **Los tokens de diseño están sin usar.** `app/globals.css` todavía tiene el andamiaje por defecto de Next.js (`--font-geist-sans`, fallback `Arial`) mientras la app real usa clases Tailwind y un logo propio. La capa de theming no se está aprovechando.
- **Colores hardcodeados:** ~191 literales hex (`#rrggbb`) repartidos en componentes, además de cientos de clases de color Tailwind inline. No hay una fuente única de la paleta. **Por qué importa:** un cambio de marca, o pasar a modo oscuro, hoy obliga a buscar y reemplazar en decenas de archivos. Centralizar la paleta en tokens (variables CSS / `@theme` de Tailwind v4, que ya usas) lo vuelve un cambio de un lugar.
- **Duplicación de cadenas largas de clases** entre vistas (mismos bloques de filtros, mismas tarjetas RAG). Buen candidato a componentes pequeños compartidos cuando descompongas los *god components* (6.1).

Nada de esto es urgente; es lo que hace que el crecimiento visual sea barato en vez de caro.

---

## 8. Matriz de priorización

Puntaje = (Impacto + Riesgo) × (6 − Esfuerzo), cada eje de 1 a 5. Mayor puntaje = atacar primero. "Impacto" = consecuencia para el producto/misión; "Riesgo" = qué pasa si no se hace; "Esfuerzo" invertido (menos esfuerzo sube la prioridad).

| # | Hallazgo | Categoría | Imp. | Riesgo | Esf. | **Puntaje** |
|---|---|---|:--:|:--:|:--:|:--:|
| 5.1 | Autorización solo en cliente (RLS por sesión, no por rol) | Seguridad | 4 | 5 | 2 | **36** |
| 6.7 | Observabilidad nula / sin alertas | Infra | 3 | 4 | 2 | **28** |
| 6.2 | `SEMAFORO_CONFIG` + lógica RAG duplicada | Código | 3 | 2 | 1 | **25** |
| 6.3 | Errores de escritura en silencio | Código | 4 | 4 | 3 | **24** |
| 4.1 | Dos modelos de datos (v1 + v2) + dual-write | Arquitectura | 5 | 4 | 4 | **18** |
| 4.2 | Identidad de región en 4 formas | Arquitectura | 3 | 3 | 3 | **18** |
| 6.5 | Sin tiempo real (último que guarda gana) | Arquitectura | 3 | 3 | 3 | **18** |
| 6.6 | Sync SEIA sobre el límite de plataforma | Infra | 3 | 3 | 3 | **18** |
| 6.4 | Sin tests | Test | 4 | 4 | 4 | **16** |
| 4.4 | Llave de negocio (`n`) como llave de mutación | Arquitectura | 2 | 3 | 3 | **15** |
| 6.1 | God components (5 archivos > 1.000 LOC) | Código | 4 | 3 | 4 | **14** |
| 4.3 | Tres formas de guardar indicadores | Arquitectura | 3 | 2 | 3 | **12** |
| 7 | Tokens de diseño sin usar / colores hardcodeados | Visual | 2 | 2 | 3 | **12** |
| 5.3 | Sin validación de entrada (`zod`) en API | Seguridad | 2 | 3 | 3 | **12** |

---

## 9. Plan de remediación por fases

Pensado para hacerse **junto a las features**, no en lugar de ellas. Las fases 0 y 1 son las que de verdad "dejan las bases listas para crecer".

### Fase 0 — Quick wins de bajo riesgo (esta semana, ~1–2 días)
Cosas baratas, de alto retorno, sin tocar arquitectura:

1. **Observabilidad (6.7):** integrar error-tracking (Sentry tiene plan gratis y se instala en Next.js en minutos) + una alerta de "sync atrasado" leyendo `sync_status`. *Cierras la ceguera operativa.*
2. **Deduplicar semáforo (6.2):** una sola definición en `lib/config.ts`, borrar la copia de `NationalDashboard.tsx:22`, centralizar el cálculo RAG en un helper. *Una tarde.*
3. **Errores visibles (6.3):** sistema de *toast* mínimo + aplicar el patrón `.update(...).select()` con chequeo en todos los call-sites del cliente. Reemplaza los `window.alert`. *Mata la familia de bugs del 29-may.*

### Fase 1 — Consolidar cimientos (antes del próximo módulo grande, ~1–2 semanas)
El corazón de "que esté perfecto antes de crecer":

4. **Cerrar la brecha de autorización (5.1):** decidir A (RLS por rol) o B (escrituras vía API con `zod`). Acompañar con un test que pruebe que un `viewer` no puede escribir. *Es la pieza de seguridad que no puede esperar al crecimiento.*
5. **Definir el modelo de datos canónico (4.1–4.3):** declarar el v2 como única fuente de verdad. Migrar las lecturas que aún usan v1 a v2, *congelar* v1 (dejar de escribirle), y planificar su borrado. Una región = una tabla (`v2_regiones`), todo por `id` con FK real.
6. **Red mínima de tests (6.4):** `lib/db.ts`, parsers de import, fechas BCCh, y las políticas RLS. No busques cobertura — busca los puntos frágiles.

### Fase 2 — Escalar con seguridad (continuo, a medida que crece)
7. **Descomponer god components (6.1)** *cuando los toques* — no un refactor de golpe.
8. **Tiempo real (6.5)** con Supabase Realtime para edición concurrente.
9. **Sync robusto (6.6):** trocear SEIA por región, reanudable; o mover a cola.
10. **Sistema de diseño (7):** centralizar paleta en tokens, limpiar `globals.css`.

### Fase 3 — Pulido
11. Llave estable de mutación (4.4): migrar de `n` a `id`/`codigo_iniciativa`.
12. Validación `zod` en todas las rutas API (5.3).
13. Convención de nombres única (4.5).

---

## Apéndice A — Consultas SQL de solo lectura para cerrar la auditoría de datos

Pégalas en *Supabase → SQL Editor*. Son todas de lectura, no modifican nada. Confirman (o descartan) varios hallazgos con datos reales.

```sql
-- A1. Volcado de TODAS las políticas RLS. Busca tablas de escritura con
--     USING (true) o auth.uid() IS NOT NULL → confirma la brecha 5.1.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- A2. ¿Qué tablas tienen RLS habilitado y cuáles no?
SELECT relname AS tabla, relrowsecurity AS rls_on
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
ORDER BY relrowsecurity, relname;

-- A3. Tamaño real de cada tabla (filas estimadas) — mide v1 vs v2.
SELECT relname AS tabla, n_live_tup AS filas_aprox
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- A4. ¿v1 y v2 están sincronizados? Compara conteos de proyectos.
SELECT 'seia_projects' AS t, count(*) FROM seia_projects
UNION ALL SELECT 'mop_projects', count(*) FROM mop_projects
UNION ALL SELECT 'v2_proyectos_inversion', count(*) FROM v2_proyectos_inversion;

-- A5. Huérfanos: prioridades cuyo `cod` no existe en el catálogo de regiones.
--     (ajusta el nombre de la tabla de regiones canónica si difiere)
SELECT DISTINCT p.cod
FROM prioridades_territoriales p
LEFT JOIN v2_regiones r ON r.cod = p.cod
WHERE r.cod IS NULL;

-- A6. ¿Cuándo corrió por última vez cada sync? Confirma 6.6/6.7.
SELECT name, last_run_at, last_status, last_rows, last_error_count
FROM sync_status ORDER BY last_run_at DESC;

-- A7. Frescura de indicadores v2 por región (detecta series estancadas).
SELECT region_id, max(periodo) AS ultimo_periodo, count(*) AS n_valores
FROM v2_indicadores_valores GROUP BY region_id ORDER BY region_id;
```

## Apéndice B — Glosario rápido

- **RLS (Row Level Security):** reglas en la base que deciden, fila por fila, quién puede leer o escribir. Si están laxas, la interfaz no alcanza a protegerte.
- **Dual-write:** escribir el mismo dato en dos tablas en dos operaciones. Sin transacción, pueden quedar en desacuerdo.
- **Tabla ancha vs. larga:** *ancha* = una columna por métrica (rígida); *larga* = una fila por (métrica, periodo, región) (flexible, escala mejor).
- **God component:** un archivo/componente que hace demasiadas cosas. Difícil de leer, testear y cambiar sin romper.
- **Prop drilling:** pasar un dato o función a través de muchos niveles de componentes solo para que llegue al fondo. *Context* lo evita.
- **Idempotente:** que correr la operación dos veces deja el mismo resultado que correrla una. `upsert ... on conflict` lo es; `insert` repetido no.
- **Observabilidad:** poder ver qué está pasando dentro del sistema (errores, métricas, logs) sin tener que adivinar.

---

*Generado como diagnóstico — no se modificó código ni datos. La auditoría de datos en vivo (Apéndice A) queda pendiente de ejecución por falta de acceso de red al entorno desde el sandbox.*
