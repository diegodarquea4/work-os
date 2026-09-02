-- ============================================================================
-- 087_comite_economico_notas_y_compromiso_privado.sql
--
-- Dos cambios al módulo de Proyectos del Comité Económico (mig 086):
--   1. `comite_economico_proyecto.notas` — el Excel de carga inicial traía
--      el detalle (N° de RCA, fechas, contexto) mezclado dentro de
--      "Estado actual" (ej. "Aprobado Ambientalmente, RCA N°... del..."). Se
--      separa: `estado_actual` pasa a un puñado de categorías estándar
--      (Preliminar / En calificación (SEIA) / Aprobado ambientalmente / En
--      construcción / En pruebas / Otro) y el detalle se traslada a `notas`.
--   2. `sesion_compromisos.proyecto_privado_id` — el compromiso "asociado a
--      proyecto" del Comité Económico debe poder apuntar a la cartera nueva
--      (privados/públicos), no solo al catálogo SEIA legado
--      (`proyecto_id` → v2_proyectos_inversion). Público reusa
--      `prioridad_id`, que ya es genérico en toda la tabla (mig 044+).
-- ============================================================================

ALTER TABLE public.comite_economico_proyecto
  ADD COLUMN IF NOT EXISTS notas TEXT;

ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS proyecto_privado_id BIGINT REFERENCES public.comite_economico_proyecto(id);

-- ── Estandarización de los 62 proyectos cargados desde el Excel (mig 086) ───
-- Separa la categoría estándar (columna estado_actual) del detalle (RCA,
-- fechas, contexto), que pasa a notas. Match por nombre — único dentro de
-- Tarapacá al momento de esta migración.

UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En fase preliminar de monitoreo ambiental' WHERE region_cod = 'I' AND nombre = 'Saturno (Ventana Futuro) CVE (Hidrogeno Verde)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En reconsideración valores de CUO' WHERE region_cod = 'I' AND nombre = 'Proyecto H2V Punta Patache (Hidrogeno Verde)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 202501101133 del 04‑08‑2025' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Llanos del Sol';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 20250100128 de 03-06-2025' WHERE region_cod = 'I' AND nombre = 'Sistema de Almacenamiento de Energía y Línea de Transmisión BESS Tambillo';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20250100177 de 26‑11‑2025' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Ramaditas';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 20240100140 de 10-10-2024' WHERE region_cod = 'I' AND nombre = 'Línea de Transmisión y Central BESS Halcón 20';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2021010013 de 21‑09‑2021' WHERE region_cod = 'I' AND nombre = 'Planta Fotovoltaica Jardín Solar';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Espera de reingreso a Calificación' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Oxum del Tamarugal';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En construcción', notas = 'RCA N° 202301101283 de 14‑05‑2024, permisos arqueológicos aprobados. En licitación de suministros.' WHERE region_cod = 'I' AND nombre = 'Parque Solar Fotovoltaico Tirana Oeste';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'Pertinencia' WHERE region_cod = 'I' AND nombre = 'Patache BESS';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'Con recurso administrativo de Nibaldo Ceballos, en espera de respuesta de SEA Nacional. RCA 20250100148 del 16/09/2025' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Solar Oriente';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Adenda 1 pendiente. Permisos sectoriales en trámite.' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Pampino';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En proceso de línea base.' WHERE region_cod = 'I' AND nombre = 'Tamarugo Solar';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 1704‑2015 de 20‑07‑2015, Pretende iniciar obras fines de 2026. Declarado en construcción en CNE' WHERE region_cod = 'I' AND nombre = 'Pampa Solar del Tamarugal (Ex-Pampa Solar)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En enero de 2026 RWE confirmó su salida del mercado chileno. Eventual venta de proyecto' WHERE region_cod = 'I' AND nombre = 'Lagunas Oriente';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En enero de 2026 RWE confirmó su salida del mercado chileno. Eventual venta de proyecto' WHERE region_cod = 'I' AND nombre = 'Nueva Pozo Almonte';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 20259900140 13/10/2025' WHERE region_cod = 'I' AND nombre = 'ERNC Tarapacá';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 20259900136 24/09/2025' WHERE region_cod = 'I' AND nombre = 'EIA Nueva S/E seccionadora Nva Lagunas y nueva Línea 2x500 kV Nueva Lagunas - Kimal';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 202501100161 de 04/11/2025' WHERE region_cod = 'I' AND nombre = 'Sistema de Almacenamiento de Energía (BESS) en Subestación Eléctrica Nueva Pozo Almonte, Ríos de Ondarreta';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En construcción', notas = 'Avance 80% construcción. Entrada en operación estimada julio 2026' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Estela Solar (Ex Aurora Solar)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'En suspensión hasta el 14 de julio, Res. Ex. N° 20260100117' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Semillero';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Res. 2026010018 extiende suspensión plazo hasta 15‑05‑2026' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico y Línea de Transmisión para el abastecimiento de instalaciones SQM en la Región de Tarapacá';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 34‑2020 de 17‑07‑2020; Sin punto de conexión; en standby' WHERE region_cod = 'I' AND nombre = 'Parque Iquique Solar';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2016010123 de 29‑11‑2016, Proyecto fehaciente en Coordinador' WHERE region_cod = 'I' AND nombre = 'Parque Solar Qanqiña';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 13‑2011 de 13‑07‑2011, Reingresos IFC en MINVU Tarapacá durante 2026' WHERE region_cod = 'I' AND nombre = 'Atacama Solar III';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20260100013 de 26‑01‑2026, (En venta de activos). RWE confirma salida del mercado' WHERE region_cod = 'I' AND nombre = 'Pita Solar';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En construcción', notas = 'Se proyecta término fin de primer semestre' WHERE region_cod = 'I' AND nombre = 'BESS Granja Solar';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA 20240100149 de 03-12-2024' WHERE region_cod = 'I' AND nombre = 'Línea de Transmisión y Central BESS Halcón 2';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 23‑2013 de 23‑01‑2013' WHERE region_cod = 'I' AND nombre = 'Parque Solar Almonte (Tata Inti)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 202301000136 de 26‑07‑2023' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Platero';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En pruebas', notas = NULL WHERE region_cod = 'I' AND nombre = 'Implementación Sistema BESS Parque Fotovoltaico Huatacondo';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20240100032 de 22‑02‑2024' WHERE region_cod = 'I' AND nombre = 'Proyecto Fotovoltaico con Almacenamiento Tamarindo';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20250100160 de 04‑11‑2025, Expediente MBN 1CO1086 en nivel central.' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico con Capacidad de Almacenamiento Pampa Perdiz';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20230100145 del 25 de septiembre de 2023, Iniciada construcción de Paño en S/E Lagunas' WHERE region_cod = 'I' AND nombre = 'Nueva Línea 2x220 kV Lagunas - Nueva Pozo Almonte, Tendido Primer Circuito';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2021010039 de 17‑05‑2021; Modificación de trazado de LT en evaluación.' WHERE region_cod = 'I' AND nombre = 'Parque Solar Fotovoltaico Arrebol';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2026010014 de 27‑01‑2026' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico con Capacidad de Almacenamiento Minerva';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Extensión de suspensión hasta 15‑05‑2026. ICSARA emitida.' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico con Capacidad de Almacenamiento Euclides';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 30‑2019 de 16‑04‑2019; Listo para construir, a la espera de respuesta CNE.' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Dolores';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 57‑2019 de 20‑05‑2019; en espera de confirmación financiación' WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Bellavista (Grenergy)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En construcción', notas = 'Atrasos por servidumbres y desistimiento de contratista.' WHERE region_cod = 'I' AND nombre = 'Planta Fotovoltaica Buenaventura (Ex-Parque Fotovoltaico Pintados)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2021010065 de 02‑06‑2021; Inicia construcción en junio 2026' WHERE region_cod = 'I' AND nombre = 'Proyecto Fotovoltaico Ceresuela';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2021010108 de 22‑09‑2021' WHERE region_cod = 'I' AND nombre = 'Proyecto Fotovoltaico Solferino';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2022010027 de 17‑02‑2022' WHERE region_cod = 'I' AND nombre = 'Proyecto Fotovoltaico El Carmelo';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En construcción', notas = NULL WHERE region_cod = 'I' AND nombre = 'Parque Fotovoltaico Andrómeda';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2021010119 de 18‑11‑2021' WHERE region_cod = 'I' AND nombre = 'Planta Fotovoltaica Tupa 9MW';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = NULL WHERE region_cod = 'I' AND nombre = 'Proyecto Apolo';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2022010048 de 25‑08‑2022; Autoconsumo faena Cosayach' WHERE region_cod = 'I' AND nombre = 'Parque Solar Fotovoltaico Soledad';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2022010049 de 25‑08‑2022; Autoconsumo faena Cosayach' WHERE region_cod = 'I' AND nombre = 'Parque Solar Fotovoltaico Negreiros';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 2023010017 de 16‑02‑2023' WHERE region_cod = 'I' AND nombre = 'Proyecto Fotovoltaico Arenisca';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N° 20230100157 del 13 de diciembre de 2023' WHERE region_cod = 'I' AND nombre = 'Modificación de la línea eléctrica de evacuación del Parque Solar Fotovoltaico Arrebol';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA Ex. N°20260100116 de 17-04-2026 (publicada 21-04-2026). A agosto de 2026 existen recursos de reclamación administrativos asociados a la RCA.' WHERE region_cod = 'I' AND nombre = 'Modificación de Proyecto Continuidad Operacional Cerro Colorado mediante la incorporación de plataformas de prospección para sondajes mineros, estudios geotécnicos e hidrogeológicos y calicatas';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Etapa de Adenda Complementaria posterior a ICSARA Complementario (plazo informado por SEA: 28-07-2026).' WHERE region_cod = 'I' AND nombre = 'Continuidad Operacional y Modificación del Proyecto Minero Sagasca';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Proceso de evaluación ambiental en curso; PAC desarrollada durante 2026.' WHERE region_cod = 'I' AND nombre = 'Modificación del Proyecto Ampliación Planta Producción de Yodo Soledad';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'RCA N°20260100124/2026. Proyecto calificado en sesión de la Comisión de Evaluación de Tarapacá de 02-06-2026.' WHERE region_cod = 'I' AND nombre = 'Modificación del proyecto Aumento producción de yodo Cala-Cala SCM COSAYACH, mediante la incorporación de propiedad minera para su continuidad operacional';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'Evaluación ambiental en curso; antecedentes complementarios requeridos durante 2026.' WHERE region_cod = 'I' AND nombre = 'Continuidad Operacional al año 2040 de Compañía Minera Punta de Lobos LTDA.';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'EIA vigente en evaluación ambiental – participación ciudadana activa durante agosto de 2026. Proyecto de extensión/reapertura ingresado al SEIA en 2026.' WHERE region_cod = 'I' AND nombre = 'Extensión operacional de la Faena Minera Cerro Colorado, mediante el mejoramiento y ampliación de las instalaciones mineras e implementación de un nuevo sistema de suministro hídrico';
UPDATE public.comite_economico_proyecto SET estado_actual = 'En calificación (SEIA)', notas = 'DIA admitida a trámite mediante Resolución de Admisibilidad N°20260100127 de 19-06-2026.' WHERE region_cod = 'I' AND nombre = 'Modificación de extracción de estéril rajo Rosario, nueva cantera Ujina y ajustes en sistema de bombeo de relaves, Faena Cordillera Collahuasi';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Preliminar', notas = 'En tramitación de CUO en Bienes Nacionales. Plano 01401-4960-CR, superficie aproximada de 12 ha' WHERE region_cod = 'I' AND nombre = 'BESS Boreal (AES Andes)';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'Pertinencia. Proyecto de 80 MW y 320 MWh.' WHERE region_cod = 'I' AND nombre = 'Sistema de Almacenamiento BESS Picaflor Azul';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'Pertinencia. Proyecto de 80 MW y 320 MWh.' WHERE region_cod = 'I' AND nombre = 'BESS Zapiga';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Aprobado ambientalmente', notas = 'Pertinencia. Sistema de almacenamiento de 25 MW y 100 MWh.' WHERE region_cod = 'I' AND nombre = 'Sistema de Almacenamiento BESS Codorniz 25 MW';
UPDATE public.comite_economico_proyecto SET estado_actual = 'Otro', notas = 'Trámites sectoriales. Sistema BESS de 29 MW y 125 MWh.' WHERE region_cod = 'I' AND nombre = 'Implementación Sistema BESS La Huayca';
