# Prompt para el dev — Hardening + versión móvil del PSG (work-os)

## Contexto

Work OS / PSG (Panel Seguimiento Gubernamental) es la app interna de la DCI (Ministerio del Interior) para monitorear iniciativas territoriales de las 16 regiones. Next.js 16 App Router + Supabase, autenticada, con RLS por rol y MFA. No es un sitio público: usuarios son funcionarios con cuenta asignada (delegados, asesores DCI, equipos regionales).

Surgió una checklist genérica de "20 cosas antes de lanzar un sitio" (pensada para landing pages / e-commerce). Se auditó el repo contra esa lista y la mayoría no aplica tal cual — el panel ya cubre lo importante (secrets fuera del cliente, HTTPS vía Vercel, 404, validación server-side con zod, sin superficie de spam). Quedan 3 tareas puntuales de esa auditoría más una necesidad real y no cubierta por la checklist: **una versión usable en celular**, porque delegados y asesores van a abrir el panel en terreno.

## Objetivo de este ticket

Arma un plan de ejecución (fases, esfuerzo estimado, orden de dependencias) para:

### A. Tres fixes rápidos de hardening/higiene (bajo riesgo, alto ratio impacto/esfuerzo)

1. **Bloquear indexación.** Hoy no hay `app/robots.ts` ni `metadata.robots`. Google no puede ver contenido (todo redirige a `/login` vía `proxy.ts`), pero sí puede indexar la URL pública y el título "PSG · Panel Seguimiento Gubernamental — Regiones", lo que expone innecesariamente que existe este sistema. Agregar:
   - `robots: { index: false, follow: false }` en `app/layout.tsx` (metadata).
   - `app/robots.ts` con `disallow: '/'`.

2. **Comprimir `public/logo-ministerio.jpg`.** Pesa 767 KB a 1247×1133 px; se renderiza a un tamaño de header (~40px alto). Convertir a WebP o PNG optimizado a un ancho razonable (~400-600px) baja el peso a <20-30 KB. Impacto directo en tiempo de carga, especialmente en 4G/terreno. De paso evaluar si conviene migrar los `<img>` existentes (7 en total, ya tienen `alt`) a `next/image` (hoy 0 usos) para lazy-loading y srcset automático — no es urgente pero es la oportunidad natural de hacerlo.

3. **Headers de seguridad en `next.config.ts`.** Hoy no hay ningún header configurado (`X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`). Para una app de gobierno con datos territoriales sensibles (campamentos, desalojos, seguridad) esto pesa más que media checklist de landing page. Definir un set mínimo razonable sin romper Supabase Storage ni el mapa (geojson, fetch a BCCh/SEIA/MOP desde server-side, no desde el cliente así que CSP no debería chocar con eso).

### B. Medición antes de actuar

4. **Lighthouse / Web Vitals** sobre `/login` (página pública) y sobre las 4 vistas principales autenticadas (Mapa, Dashboard, Bandeja de Atención, Kanban), en desktop y mobile emulation. No se ha medido nada todavía — no asumir dónde está el cuello de botella. Sospecha a validar: el Mapa (capas PSG y Autoridades, geojson de comunas/distritos) es probablemente el punto más pesado en móvil por el tamaño de los geojson y el render de Leaflet/mapa.

5. Con los resultados de (4), decidir si el punto 19 de la checklist ("analytics") vale la pena en versión sobria: **Vercel Web Analytics** (sin cookies, sin tercero externo, no es Google Analytics) para saber qué regiones/usuarios realmente entran y qué vista usan — es el argumento de adopción frente a la jefatura, no vanidad. Alternativa más liviana: aprovechar la tabla `actividad` que ya existe (`app/api/actividad/[cod]/route.ts`) para un reporte de "último acceso por usuario/región" sin agregar ninguna dependencia nueva.

### C. Versión móvil (el punto no cubierto por la checklist y el más importante)

El caso de uso real: una Delegada Presidencial Regional o su asesor abre el panel desde el celular en una visita a terreno, sin wifi estable, para ver el estado de una iniciativa o actualizar un semáforo rápido. Hoy no sabemos qué tan bien funciona eso — es la premisa a validar con (4) antes de diseñar la solución.

Preguntas que el plan debe responder, no resolver de antemano:

- ¿Responsive dentro de la misma app (breakpoints, layout condicional por vista) alcanza, o el Mapa necesita una experiencia distinta en móvil (por ejemplo, lista/tarjetas en vez de mapa interactivo por defecto, con opción de abrir el mapa)?
- ¿Cuáles de las 4 vistas tienen prioridad para uso en terreno? Hipótesis: Bandeja de Atención y actualización rápida de semáforo/avance/responsable son las acciones más probables en móvil — el Mapa y el Kanban son más de escritorio/oficina.
- ¿Vale la pena un modo "PWA" liviano (instalable, ícono en home screen, funciona con conectividad intermitente) dado que el caso de uso es literalmente terreno con mala señal? Evaluar costo real vs. beneficio, no asumir que sí.
- Revisar accesibilidad de los semáforos en pantallas chicas: hoy el estado usa solo color (verde/amarillo/rojo) — en móvil con luz de sol o daltonismo esto es más grave que en desktop. Sumar ícono o texto al semáforo debería ir en el mismo paquete de trabajo.

No se pide implementación en este ticket, solo el plan: qué se mide primero, qué decisiones dependen de esa medición, cómo se secuencian las fases, y una estimación de esfuerzo por fase.

## Fuera de alcance (evaluado y descartado en la auditoría, no reabrir sin razón nueva)

- Política de privacidad / términos y condiciones estilo e-commerce: no aplica a un sistema interno de gobierno. Si en algún momento el panel maneja datos personales de terceros (dirigentes, ocupantes de campamentos), eso es un tema de cumplimiento de Ley 19.628 / Ley 21.719, a tratar como su propio proyecto de gobernanza de datos, no como "política de privacidad de sitio web".
- Banner de cookies: no hay tracking de terceros, cookies son de sesión (Supabase auth).
- Sitemap / social preview image: contraproducente para un panel privado — va en la dirección contraria del punto A.1.
- Anti-spam / captchas en formularios: no hay superficie pública de formularios; todo está detrás de `proxy.ts` + login, y las rutas semi-expuestas (`mfa/recover`, `activate`) ya tienen rate limiting.
- Validación de formularios en cliente con librería (react-hook-form, etc.): la validación server-side con zod (`lib/schemas/index.ts`) ya cubre las rutas que reciben body JSON; agregar duplicación en cliente es bajo prioridad para un panel de usuarios internos conocidos.

## Entregable esperado de este ticket

Un plan corto (no un documento largo) con: orden de fases, qué bloquea qué (ej: medición antes de decidir alcance del rediseño móvil), estimación de esfuerzo, y qué decisiones necesitan involucrar a alguien de la DCI antes de ejecutarse (por ejemplo, si el modo PWA se justifica).
