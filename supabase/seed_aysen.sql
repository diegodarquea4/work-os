-- ============================================================
-- PSG — Migración esquema + seed Aysén
-- Ejecutar en Supabase SQL Editor (orden importa)
-- ============================================================

-- ── 1. Renombrar columnas existentes ─────────────────────────
ALTER TABLE prioridades_territoriales RENAME COLUMN meta       TO nombre;
ALTER TABLE prioridades_territoriales RENAME COLUMN ministerios TO ministerio;

-- ── 2. Eliminar columnas obsoletas ───────────────────────────
ALTER TABLE prioridades_territoriales DROP COLUMN IF EXISTS plazo;
ALTER TABLE prioridades_territoriales DROP COLUMN IF EXISTS fecha_limite;

-- ── 3. Agregar columnas nuevas ────────────────────────────────
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS descripcion              TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS etapa_actual             TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS estado_termino_gobierno  TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS proximo_hito             TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS fecha_proximo_hito       DATE;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS fuente_financiamiento    TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS codigo_bip               TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS inversion_mm             NUMERIC;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS comuna                   TEXT;
ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS rat                      TEXT;

-- ── 4. Limpiar datos existentes (CASCADE limpia FK) ──────────
TRUNCATE TABLE documentos_prioridad, seguimientos, semaforo_log, prioridades_territoriales
  RESTART IDENTITY CASCADE;

-- ── 5. Insertar 66 iniciativas reales de Aysén ───────────────
INSERT INTO prioridades_territoriales
  (n, region, cod, capital, zona, eje, nombre, descripcion, ministerio, prioridad,
   etapa_actual, estado_termino_gobierno, proximo_hito, fecha_proximo_hito,
   fuente_financiamiento, codigo_bip, inversion_mm, comuna, rat, codigo_iniciativa,
   estado_semaforo, pct_avance)
VALUES

-- Eje 1: Infraestructura y Conectividad (AY-01-001 … AY-01-018)
(1,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Mejoramiento Ruta 7: Cuesta Queulat y Cerro Castillo-Cochrane',
 'Mejoramiento y pavimentación de tramos críticos de la Ruta 7 en sectores Cuesta Queulat y Cerro Castillo-Cochrane. Iniciativa presidencial que mejora conectividad longitudinal de la región.',
 'Ministerio de Obras Públicas','Alta','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2027-12-31',
 'Sectorial',NULL,NULL,'Cisnes / Cochrane','No Ingresado','AY-01-001','gris',0),

(2,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Reposición Puentes Palena y Rosselot, La Junta',
 'Reposición de los puentes Palena y Rosselot en La Junta, estructuras críticas para la continuidad vial de la Carretera Austral. Iniciativa presidencial.',
 'Ministerio de Obras Públicas','Alta','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2027-12-31',
 'Sectorial',NULL,NULL,'Cisnes','No Ingresado','AY-01-002','gris',0),

(3,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Reparación tensores Puente Ibáñez',
 'Reparación urgente de los tensores del Puente Ibáñez. Iniciativa presidencial con plazo comprometido 2026.',
 'Ministerio de Obras Públicas','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,NULL,'Río Ibáñez','No Ingresado','AY-01-003','gris',0),

(4,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Conservación Ruta 7 Sur sector Coyhaique-Pampa Melipal',
 'Conservación y mantenimiento de la Ruta 7 Sur en el sector Coyhaique-Pampa Melipal. Inversión $20.300 MM. En ejecución.',
 'Ministerio de Obras Públicas','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,20300,'Coyhaique','IN','AY-01-004','gris',0),

(5,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Construcción conexión vial Lago Verde-La Tapera',
 'Construcción de la conexión vial entre Lago Verde y La Tapera. Inversión $128.600 MM. En ejecución, mejora conectividad de comunas aisladas.',
 'Ministerio de Obras Públicas','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2027-12-31',
 'Sectorial',NULL,128600,'Lago Verde','RS','AY-01-005','gris',0),

(6,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Construcción conexión vial Río Tranquilo-Lago Brown-Frontera',
 'Construcción de conexión vial entre Río Tranquilo, Lago Brown y frontera con Argentina. Inversión $71.500 MM. En ejecución.',
 'Ministerio de Obras Públicas','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2027-12-31',
 'Sectorial',NULL,71500,'Río Ibáñez','RS','AY-01-006','gris',0),

(7,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Conexión vial sector Balsa Baker, Cochrane',
 'Mejoramiento de la conexión vial en el sector Balsa Baker, Cochrane. Inversión $35.600 MM. En ejecución.',
 'Ministerio de Obras Públicas','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2027-12-31',
 'Sectorial',NULL,35600,'Cochrane','RS','AY-01-007','gris',0),

(8,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Camino penetración Ruta 7-Ruta X-91 Puerto Yungay',
 'Construcción de camino de penetración entre Ruta 7 y Ruta X-91 Puerto Yungay, mejorando acceso a Villa O''Higgins. Inversión $52.600 MM. En diseño.',
 'Ministerio de Obras Públicas','Media','Diseño','Término Diseño','Término Diseño/Preinversión','2027-12-31',
 'Sectorial',NULL,52600,'O''Higgins','En Tramitación','AY-01-008','gris',0),

(9,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Ampliación Rampa Isla Toto, Cisnes',
 'Ampliación de rampa portuaria en Isla Toto, Cisnes. Inversión $5.500 MM. En ejecución.',
 'Ministerio de Obras Públicas','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,5500,'Cisnes','RS','AY-01-009','gris',0),

(10,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Construcción Borde Costero Puyuhuapi',
 'Construcción del borde costero de Puyuhuapi. Inversión $9.600 MM. En ejecución.',
 'Ministerio de Obras Públicas','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2027-12-31',
 'Sectorial',NULL,9600,'Cisnes','RS','AY-01-010','gris',0),

(11,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Ampliación infraestructura portuaria Exploradores',
 'Ampliación de infraestructura portuaria en sector Exploradores. Inversión $5.800 MM. Sin ejecución, requiere impulso.',
 'Ministerio de Obras Públicas','Media','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2027-12-31',
 'Sectorial',NULL,5800,'Río Ibáñez','En Tramitación','AY-01-011','gris',0),

(12,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Ampliación caleta pescadores Puerto Aguirre',
 'Ampliación de caleta de pescadores en Puerto Aguirre. Inversión $4.200 MM. Sin ejecución.',
 'Ministerio de Obras Públicas','Baja','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2028-12-31',
 'Sectorial',NULL,4200,'Aysén','No Ingresado','AY-01-012','gris',0),

(13,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Ampliación muelle Puerto Tranquilo, Río Ibáñez',
 'Ampliación de muelle en Puerto Tranquilo, Río Ibáñez. Inversión $4.200 MM. Sin ejecución.',
 'Ministerio de Obras Públicas','Baja','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2028-12-31',
 'Sectorial',NULL,4200,'Río Ibáñez','No Ingresado','AY-01-013','gris',0),

(14,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Continuidad barcazas como servicio público básico permanente',
 'Asegurar la continuidad operacional de barcazas como servicio público básico no sujeto al mercado, clave para soberanía logística de comunas insulares y aisladas.',
 'Ministerio de Transportes y Telecomunicaciones','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-01-014','gris',0),

(15,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Fibra óptica y 5G en localidades aisladas de Aysén',
 'Despliegue de fibra óptica y 5G en localidades aisladas. Meta: 5G en cabeceras comunales de Cochrane, Chile Chico y Cisnes al 2027. Coordinación Subtel-Min. Ciencia.',
 'Ministerio de Ciencias, Tecnología, Conocimiento e Innovación','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2027-12-31',
 'Sectorial',NULL,NULL,'Regional','No Ingresado','AY-01-015','gris',0),

(16,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Fortalecimiento Fibra Óptica Austral: tramos submarinos pendientes',
 'Extensión de la Fibra Óptica Austral completando tramos submarinos pendientes en macrozona sur. Prioridad Subtel 2026-2028.',
 'Ministerio de Transportes y Telecomunicaciones','Alta','Ejecución','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Regional','En Tramitación','AY-01-016','gris',0),

(17,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Conectividad satelital (Starlink) en postas rurales y escuelas aisladas',
 'Habilitación de conectividad satelital (Starlink) en postas rurales y escuelas aisladas para telemedicina y acceso a servicios del Estado. Coordinación Min. Ciencia-Salud-Educación.',
 'Ministerio de Ciencias, Tecnología, Conocimiento e Innovación','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-01-017','gris',0),

(18,'Aysén','XI','Coyhaique','Austral','Eje 1: Infraestructura y Conectividad',
 'Telemedicina rural vinculada a conectividad satelital',
 'Habilitación de telemedicina rural en postas con conectividad satelital. Piloto activo 2026. Coordinación Min. Salud-Subtel.',
 'Ministerio de Salud','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-01-018','gris',0),

-- Eje 2: Energía y Medio Ambiente (AY-02-001 … AY-02-012)
(19,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Aplicación Art. 157 Ley 21.804: pareo tarifario eléctrico julio 2026',
 'Aplicación del artículo 157 de la Ley 21.804 para pareo tarifario eléctrico en Aysén, con rebaja estimada de 18-20% en tarifas. Urgente: entrada en vigencia julio 2026. Resp: Min. Energía-CNE.',
 'Ministerio de Energía','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-07-01',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-02-001','gris',0),

(20,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Resolución racionamiento eléctrico Tortel y fallas alumbrado Melinka',
 'Solución urgente al racionamiento eléctrico activo en Tortel y fallas de alumbrado público en Melinka. Coordinación Min. Energía-SEC-GORE.',
 'Ministerio de Energía','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,NULL,'Tortel / Guaitecas','No Requiere','AY-02-002','gris',0),

(21,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Agenda Regional de Energía Aysén 2026-2030',
 'Diseño e implementación de la Agenda Regional de Energía Aysén, con diversificación hacia fuentes hídrica, eólica y biomasa. Coordinación Min. Energía-GORE.',
 'Ministerio de Energía','Alta','Preinversión','Otro','Otro','2026-12-31',
 'Mixto',NULL,NULL,'Regional','No Requiere','AY-02-003','gris',0),

(22,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Ampliación vida útil Central Térmica Chacabuco',
 'Ampliación de vida útil de la Central Térmica Chacabuco. Inversión $4.849 MM. En calificación SEIA desde noviembre 2025.',
 'Ministerio de Energía','Alta','Preinversión','Otro','Otro','2026-06-30',
 'Privado',NULL,4849,'Coyhaique','En Tramitación','AY-02-004','gris',0),

(23,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Ampliación vida útil Central Térmica Tehuelche, Salto Malo',
 'Ampliación de vida útil de la Central Térmica Tehuelche en Salto Malo. Inversión $3.336 MM. En calificación SEIA desde mayo 2025.',
 'Ministerio de Energía','Alta','Preinversión','Otro','Otro','2026-12-31',
 'Privado',NULL,3336,'Coyhaique','En Tramitación','AY-02-005','gris',0),

(24,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Rehabilitación y ampliación mini central hidroeléctrica',
 'Rehabilitación y ampliación de mini central hidroeléctrica en Aysén. Inversión $12.000 MM. Aprobado SEIA octubre 2024, en ejecución.',
 'Ministerio de Energía','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2027-12-31',
 'Privado',NULL,12000,'Regional','RS','AY-02-006','gris',0),

(25,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Proyectos hidrógeno verde (H2V) de pequeña y mediana escala',
 'Desarrollo de proyectos de hidrógeno verde de pequeña y mediana escala aprovechando factor de planta eólico >45% en Aysén. Coordinación Min. Energía-Corfo. Horizonte 2027-2030.',
 'Ministerio de Energía','Media','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2030-12-31',
 'Mixto',NULL,NULL,'Regional','No Ingresado','AY-02-007','gris',0),

(26,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Bono Calefacción Dinámico con factor territorial patagónico',
 'Propuesta de actualización del bono de calefacción incorporando factor territorial patagónico para Aysén. Coordinación Min. Energía-MIDESO.',
 'Ministerio de Energía','Media','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-02-008','gris',0),

(27,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Reingreso PDA (Plan Descontaminación Atmosférica) Puerto Aysén',
 'Reingreso del proceso de Plan de Descontaminación Atmosférica (PDA) para Puerto Aysén ante el Ministerio del Medio Ambiente. El PDA de Coyhaique está vigente.',
 'Ministerio del Medio Ambiente','Alta','Preinversión','Otro','Obtención Financiamiento','2026-12-31',
 'Sectorial',NULL,NULL,'Aysén','No Requiere','AY-02-009','gris',0),

(28,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Recambio calefactores en comunas sin PDA: Cisnes, Cochrane, O''Higgins',
 'Programa de recambio de calefactores en comunas sin PDA vigente: Cisnes, Cochrane y O''Higgins. Financiamiento GORE-FNDR.',
 'Ministerio del Medio Ambiente','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2028-12-31',
 'FNDR',NULL,NULL,'Cisnes / Cochrane / O''Higgins','No Requiere','AY-02-010','gris',0),

(29,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Fiscalización SMA: cierre Tranque Confluencia, Mina El Toqui',
 'Gestión del cierre del Tranque Confluencia de la Mina El Toqui por riesgo ambiental activo. Fiscalización a cargo de la SMA.',
 'Ministerio del Medio Ambiente','Alta','Ejecución','Otro','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Aysén','No Requiere','AY-02-011','gris',0),

(30,'Aysén','XI','Coyhaique','Austral','Eje 2: Energía y Medio Ambiente',
 'Programa eficiencia energética habitacional: aislación térmica parque antiguo',
 'Programa de aislación térmica del parque habitacional antiguo de Aysén para mejorar eficiencia energética, reducir uso de leña y disminuir contaminación atmosférica. Coordinación MINVU-Min. Energía.',
 'Ministerio de Vivienda y Urbanismo','Media','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-02-012','gris',0),

-- Eje 3: Salud y Servicios Básicos (AY-03-001 … AY-03-010)
(31,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Auditoría Servicio Salud Aysén: evaluación de eficiencia del modelo único',
 'Auditoría urgente del Servicio de Salud Aysén, modelo único en Chile, para evaluar su eficiencia y eficacia. Fuente: DPR Aysén 2026.',
 'Ministerio de Salud','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','No Requiere','AY-03-001','gris',0),

(32,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Nuevo Hospital Regional de Coyhaique: avance diseño y financiamiento',
 'Avance del proyecto Nuevo Hospital Regional de Coyhaique, actualmente en etapa de prefactibilidad. Costo solo diseño estimado $320 MM.',
 'Ministerio de Salud','Alta','Preinversión','Término Etapa Preinversional','Término Diseño/Preinversión','2028-12-31',
 'Sectorial',NULL,320,'Coyhaique','FI','AY-03-002','gris',0),

(33,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Acreditación Hospital Puerto Aysén: normalización de mediana complejidad',
 'Normalización y obtención de acreditación del Hospital de Puerto Aysén como establecimiento de mediana complejidad. Hospital opera sin acreditación vigente.',
 'Ministerio de Salud','Alta','Preinversión','Otro','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Aysén','No Requiere','AY-03-003','gris',0),

(34,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Reposición CESFAM N°1 y N°2, Coyhaique',
 'Reposición de los CESFAM N°1 y N°2 de Coyhaique, proyectos con atraso en programación. En gestión con Min. Salud.',
 'Ministerio de Salud','Alta','Preinversión','Inicio Obras/Programa','Obtención Financiamiento','2028-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','En Tramitación','AY-03-004','gris',0),

(35,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Construcción CESFAM N°3, Coyhaique',
 'Construcción del CESFAM N°3 en Coyhaique. Cuenta con Resolución de Satisfacción reciente. Inicio de construcción pendiente.',
 'Ministerio de Salud','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','RS','AY-03-005','gris',0),

(36,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Programa atracción y retención de especialistas médicos en Aysén',
 'Diseño e implementación de programa para atraer y retener especialistas médicos permanentes en Aysén: oncología, cardiología y salud mental. Coordinación Min. Salud-GORE.',
 'Ministerio de Salud','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-03-006','gris',0),

(37,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Rondas médicas permanentes en Tortel, Villa O''Higgins y Guaitecas',
 'Rondas médicas permanentes en localidades aisladas de Tortel, Villa O''Higgins y Guaitecas. Financiamiento GORE-FNDR.',
 'Ministerio de Salud','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'FNDR',NULL,NULL,'Tortel / O''Higgins / Guaitecas','No Requiere','AY-03-007','gris',0),

(38,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'APR: soluciones agua potable rural para 12,6% de hogares sin red pública',
 'Soluciones de Agua Potable Rural (APR) para el 12,6% de hogares de Aysén sin acceso a red pública. Cartera de soluciones MOP-DOH 2026-2028.',
 'Ministerio de Obras Públicas','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Regional','En Tramitación','AY-03-008','gris',0),

(39,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Electrificación renovable Tortel y Melinka',
 'Soluciones de electrificación con ERNC para Tortel y Melinka, condición habilitante para salud continua. En diseño Min. Energía.',
 'Ministerio de Energía','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Tortel / Guaitecas','No Ingresado','AY-03-009','gris',0),

(40,'Aysén','XI','Coyhaique','Austral','Eje 3: Salud y Servicios Básicos',
 'Ambulancias y equipamiento postas rurales en zonas insulares',
 'Dotación de ambulancias y equipamiento a postas rurales en zonas insulares de Huichas y Guaitecas. Resp: Min. Salud.',
 'Ministerio de Salud','Media','Preinversión','Inaugurado/Terminado/Presentado','Otro','2027-12-31',
 'Sectorial',NULL,NULL,'Guaitecas / Cisnes','No Requiere','AY-03-010','gris',0),

-- Eje 4: Seguridad y Soberanía (AY-04-001 … AY-04-009)
(41,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Plan Escudo Fronterizo: control costero e insular',
 'Implementación del Plan Escudo Fronterizo con foco en control de puertos, islas y aeródromos para contener el narcotráfico. Coordinación Armada-PDI-Carabineros.',
 'Ministerio del Interior y Seguridad Pública','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-04-001','gris',0),

(42,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Refuerzo fiscalización DGAC: aeródromo Balmaceda y pistas menores',
 'Refuerzo de la fiscalización de la DGAC en el aeródromo Balmaceda y pistas menores de la región para control de tráfico ilícito.',
 'Ministerio de Transportes y Telecomunicaciones','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','No Requiere','AY-04-002','gris',0),

(43,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Aumento dotación Aduana en pasos Huemules, Coyhaique Alto y Chile Chico',
 'Aumento de dotación del Servicio Nacional de Aduanas en los pasos habilitados Huemules, Coyhaique Alto y Chile Chico.',
 'Ministerio de Hacienda','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Lago Verde / Coyhaique / Chile Chico','No Requiere','AY-04-003','gris',0),

(44,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Mejoras infraestructura pasos fronterizos Coyhaique Alto y Chile Chico',
 'Mejoras urgentes de infraestructura en los pasos fronterizos de Coyhaique Alto y Chile Chico. Coordinación MOP-DPR Aysén.',
 'Ministerio de Obras Públicas','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Coyhaique / Chile Chico','No Ingresado','AY-04-004','gris',0),

(45,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Presencia soberana permanente Paso Mayer y Campos de Hielo',
 'Fortalecimiento de la presencia soberana permanente en el Paso Mayer y Campos de Hielo. Coordinación Min. Defensa-Ejército.',
 'Ministerio de Defensa Nacional','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'O''Higgins','No Requiere','AY-04-005','gris',0),

(46,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Estrategia Chile 2A (Austral-Antártico): soberanía e I+D en Patagonia',
 'Articulación de la Estrategia Chile 2A (Austral-Antártico) con Cancillería para fortalecer posición antártica e I+D en Patagonia. Coordinación Min. Defensa-Cancillería-Min. Ciencia.',
 'Ministerio de Defensa Nacional','Media','Preinversión','Otro','Otro','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-04-006','gris',0),

(47,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Intervención integral Violencia Intrafamiliar con enfoque territorial',
 'Programa intersectorial de intervención integral en VIF con enfoque territorial, considerando aislamiento invernal y consumo problemático de alcohol. Coordinación Min. Mujer-MIDESO-Min. Salud.',
 'Ministerio de la Mujer y la Equidad de Género','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-04-007','gris',0),

(48,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Centros de atención a víctimas de VIF en comunas aisladas',
 'Instalación de centros de atención a víctimas de VIF en comunas aisladas de Aysén. Coordinación Min. Mujer-GORE.',
 'Ministerio de la Mujer y la Equidad de Género','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'FNDR',NULL,NULL,'Regional','No Ingresado','AY-04-008','gris',0),

(49,'Aysén','XI','Coyhaique','Austral','Eje 4: Seguridad y Soberanía',
 'Control pesca ilegal y tala ciprés: refuerzo SERNAPESCA y SAG',
 'Refuerzo de la capacidad fiscalizadora de SERNAPESCA y SAG para control de pesca ilegal y tala de ciprés en el extenso territorio de Aysén.',
 'Ministerio de Agricultura','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2028-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-04-009','gris',0),

-- Eje 5: Desarrollo Productivo e Innovación (AY-05-001 … AY-05-007)
(50,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Impulsar procesamiento local del salmón: valor agregado en la región',
 'Propuesta de royalty e industrialización local de la salmonicultura, actualmente con 40% de producción nacional pero procesamiento fuera de Aysén. Agenda regional coordinada con GORE.',
 'Ministerio de Economía, Fomento y Turismo','Alta','Preinversión','Otro','Otro','2030-12-31',
 'Mixto',NULL,NULL,'Regional','No Requiere','AY-05-001','gris',0),

(51,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Fortalecimiento INDESPA en Aysén',
 'Fortalecimiento institucional del INDESPA en Aysén, actualmente con solo 1 funcionaria. Déficit crítico para fiscalización pesquero-sanitaria.',
 'Ministerio de Economía, Fomento y Turismo','Alta','Preinversión','Inaugurado/Terminado/Presentado','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-05-002','gris',0),

(52,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Concesiones turísticas de largo plazo en ASP patagónicas',
 'Tramitación de concesiones turísticas de largo plazo en Áreas Silvestres Protegidas patagónicas. En tramitación ante Min. Economía-Bienes Nacionales.',
 'Ministerio de Economía, Fomento y Turismo','Media','Preinversión','Otro','Otro','2027-12-31',
 'Privado',NULL,NULL,'Regional','No Requiere','AY-05-003','gris',0),

(53,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Mesa Ley I+D Aysén: adaptación para MiPymes regionales',
 'Formación de mesa Corfo+GORE+SII+Universidades+Gremios para adaptar la Ley I+D a la realidad de las MiPymes de Aysén. La Ley I+D fue usada solo 3 veces en la región entre 2012 y 2024.',
 'Ministerio de Economía, Fomento y Turismo','Media','Preinversión','Otro','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-05-004','gris',0),

(54,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Plan ovino-bovino: planta de faenamiento y trazabilidad',
 'Plan de recuperación del stock ovino y bovino con habilitación de planta de faenamiento para abastecimiento regional y trazabilidad. Coordinación Min. Agricultura-SAG-Indap.',
 'Ministerio de Agricultura','Media','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2029-12-31',
 'Mixto',NULL,NULL,'Regional','No Ingresado','AY-05-005','gris',0),

(55,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Vitivinicultura cuenca Lago General Carrera: certificación de origen',
 'Desarrollo del sector vitivinícola emergente en la cuenca del Lago General Carrera con certificación de origen y potencial exportador. Coordinación SAG-Min. Agricultura.',
 'Ministerio de Agricultura','Baja','Preinversión','Otro','Otro','2030-12-31',
 'Mixto',NULL,NULL,'Chile Chico','No Requiere','AY-05-006','gris',0),

(56,'Aysén','XI','Coyhaique','Austral','Eje 5: Desarrollo Productivo e Innovación',
 'Aysén como región piloto de ciencia e IA: laboratorio natural',
 'Posicionamiento de Aysén como región piloto de ciencia e inteligencia artificial, laboratorio natural reconocido internacionalmente. Coordinación Min. Ciencia-GORE. Horizonte 2027-2030.',
 'Ministerio de Ciencias, Tecnología, Conocimiento e Innovación','Media','Preinversión','Otro','Inicio Obras/Programa','2030-12-31',
 'Mixto',NULL,NULL,'Regional','No Requiere','AY-05-007','gris',0),

-- Eje 6: Familia, Educación y Equidad Territorial (AY-06-001 … AY-06-010)
(57,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'DS49 Chacra G, Coyhaique: construcción viviendas sociales',
 'Proyecto DS49 Chacra G para construcción de viviendas sociales en Coyhaique. Inversión $144.000 MM. En calificación SEIA desde diciembre 2025. Principal iniciativa habitacional en cartera.',
 'Ministerio de Vivienda y Urbanismo','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'Sectorial',NULL,144000,'Coyhaique','En Tramitación','AY-06-001','gris',0),

(58,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Programa aislación térmica: parque habitacional antiguo',
 'Programa de aislación térmica del parque habitacional antiguo de Aysén para mejorar eficiencia energética y reducir contaminación. Coordinación MINVU-Min. Energía.',
 'Ministerio de Vivienda y Urbanismo','Media','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2030-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-06-002','gris',0),

(59,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Reposición Escuela Diferencial Despertar, Aysén',
 'Reposición de la Escuela Diferencial Despertar en Aysén. Habilitación DEM en ejecución. Término estimado junio 2026. Urgente.',
 'Ministerio de Educación','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-06-30',
 'Sectorial',NULL,NULL,'Aysén','RS','AY-06-003','gris',0),

(60,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Reposición Escuela Diferencial España, Coyhaique',
 'Reposición de la Escuela Diferencial España en Coyhaique. En identificación presupuestaria DIPRES.',
 'Ministerio de Educación','Alta','Preinversión','Término Diseño','Obtención Financiamiento','2027-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','En Tramitación','AY-06-004','gris',0),

(61,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Normalización calefacción 7 establecimientos SLEP Aysén',
 'Normalización urgente del sistema de calefacción (estufas pellet con fallas) en 7 de 20 establecimientos administrados por SLEP Aysén.',
 'Ministerio de Educación','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2026-12-31',
 'Sectorial',NULL,NULL,'Regional','No Requiere','AY-06-005','gris',0),

(62,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Plan integral Tortel: energía, salud, conectividad y alcantarillado',
 'Plan integral para Tortel abordando racionamiento eléctrico activo, salud rural, conectividad marítima y alcantarillado. Financiamiento PDZE/FNDR. Coordinación DCI-GORE.',
 'Ministerio del Interior y Seguridad Pública','Alta','Ejecución','Inaugurado/Terminado/Presentado','Término Obras/Programa','2028-12-31',
 'PEDZE',NULL,NULL,'Tortel','No Requiere','AY-06-006','gris',0),

(63,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Plan integral Villa O''Higgins: servicios básicos, conectividad y salud rural',
 'Plan integral para Villa O''Higgins (acceso solo por 560 km de Ruta X-91 o por Argentina) abordando servicios básicos, conectividad y salud rural. Financiamiento PDZE/FNDR.',
 'Ministerio del Interior y Seguridad Pública','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'PEDZE',NULL,NULL,'O''Higgins','No Requiere','AY-06-007','gris',0),

(64,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Plan integral Melinka (Guaitecas): alumbrado, energía y conectividad marítima',
 'Plan integral para Melinka (Guaitecas) abordando fallas de alumbrado público, energía y conectividad marítima deficiente. Financiamiento PDZE/FNDR.',
 'Ministerio del Interior y Seguridad Pública','Alta','Preinversión','Inicio Obras/Programa','Inicio Obras/Programa','2028-12-31',
 'PEDZE',NULL,NULL,'Guaitecas','No Requiere','AY-06-008','gris',0),

(65,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Caso Escuela Villa Amengual, Lago Verde: seguimiento medida cautelar',
 'Seguimiento de medida cautelar y protocolo de seguridad para Escuela Villa Amengual, Lago Verde. Agresor en prisión preventiva. Coordinación DPR-Min. Interior.',
 'Ministerio de Educación','Alta','Ejecución','Otro','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Lago Verde','No Requiere','AY-06-009','gris',0),

(66,'Aysén','XI','Coyhaique','Austral','Eje 6: Familia, Educación y Equidad Territorial',
 'Solución definitiva planta tratamiento aguas Escuela Valle Simpson, Coyhaique',
 'Solución definitiva a riesgo sanitario por planta de tratamiento de aguas contigua a la Escuela Valle Simpson en Coyhaique. Coordinación Municipio-Min. Educación.',
 'Ministerio de Educación','Alta','Preinversión','Otro','Otro','2026-12-31',
 'Sectorial',NULL,NULL,'Coyhaique','No Requiere','AY-06-010','gris',0);
