# Inventario operativo del cupo de Clubes de Campo

Fecha de corte: 2026-10-07  
Estado: **inventario nominal v1 + candidatos físicos ML**.

## Resumen ejecutivo

**Lectura obligatoria:** el proyecto mantiene separados el indicador físico Productivo y el cálculo jurídico del cupo. El primero ya tiene denominador cerrado; el segundo no se cerrará hasta reconstruir las exclusiones históricas del artículo 3.1 y contrastarlas con el ledger municipal.

- Denominador físico Productivo GIS: **1303.584699 ha**.
- Benchmark territorial del 10% sobre Productivo: **130.3584699 ha**.
- Denominador jurídico literal del art. 3.1: **pendiente de reconstrucción histórica de exclusiones**.
- Hectáreas ordinarias documentalmente confirmadas en el dataset actual: **0.000 ha**; consistente con el RPUC provincial publicado, que no registra ningún tipo `CC` en Almirante Brown.
- Hectáreas de candidatos físicos positivos/strong dentro de Productivo observados por ML: **45.596832 ha**.
- Cobertura ML actual: parcial; Cluster 2 observa 74 de 520 parcelas Productivo, por lo que **todavía no existe base para concluir cumplimiento/incumplimiento del cupo**.

`0.000 ha confirmado` significa únicamente que, entre los casos con documentación actualmente incorporada, todavía no hay un proyecto vinculado de forma suficiente a un acto de Club de Campo que consuma el cupo ordinario. No significa que el Municipio no haya aprobado ninguno.

## Control administrativo provincial

El Registro Provincial de Urbanizaciones Cerradas (RPUC) de la Provincia de Buenos Aires, con impresión oficial 07-05-2026, registra para **Almirante Brown** solamente:

| Registro | Fecha | Emprendimiento | Tipo |
| --- | --- | --- | --- |
| 3-297 | 03/12/2015 | Brisas de Adrogué | BC |
| 3-298 | 03/12/2015 | Adrogué Chico | BC |

No aparece ningún registro tipo `CC` (Club de Campo) para Almirante Brown en el RPUC publicado. Esto es un control administrativo fuerte, pero no permite concluir que no existan proyectos de Club de Campo en trámite, con aprobación incompleta, ni urbanizaciones físicas/comerciales no inscriptas.

Consecuencia para el indicador: **no se incorpora ninguna hectárea al numerador ordinario sólo por publicidad o transformación física**. Todo candidato debe vincularse a expediente/acto y verificarse contra RPUC o su estado de trámite.

Fuente oficial: https://urbasig.mgob.gba.gob.ar/rpuc/pdf.php?partido=

## Inventario nominal

| Caso | Evidencia disponible | Superficie conocida | Zona / contexto | Tratamiento ordinario actual |
| --- | --- | ---: | --- | --- |
| **Urban Green** | EIA 2020: “Club de campo y Reservorio hídrico”; Exp. municipal 4003-0-00000012313-2020; Circ. IV, parcela 790, partida 339 | 23.90 ha declaradas; GeoARBA actual 23.736661 ha | **Recuperación** en Anexo I 11.819/20 | **Fuera del 10% ordinario** en el modelo; verificar acto final |
| **Saint Henri Aero & Country Club** | comercialización pública + hipótesis catastral 770–777 | ~56.600442 ha del bloque candidato | Uso Específico + Recuperación según reconstrucción | **No sumar** al ordinario hasta cerrar polígono/expediente; hipótesis fuerte de excepción |
| **Barrio Parque América** | desarrolladora propia; 7 manzanas; lotes 324–700 m²; muro/seguridad | pendiente | pendiente | No contado: falta encuadre administrativo y polígono |
| **Estancias del Sur** | oferta activa; Chivilcoy/Calderón; lotes 300–320 m²; calles/redes/cerco | pendiente | pendiente | No contado: se publicita como barrio abierto con urbanización protegida, no como Club de Campo |
| **Barrio Cerrado La Ramona** | oferta inmobiliaria; lotes ~300 m² | pendiente | pendiente | No contado: falta acto y polígono |
| **Barrio Don Vicente** | oferta; 14 lotes reportados de 360 m²; otra fuente indica zonificación suburbana | ≥0.504 ha privativas + comunes | posible Suburbana | No contado |
| **Portal del Sol I** | condominio; Chivilcoy 578; lotes ~680 m² | pendiente | pendiente | No contado |
| **Barrio/condominio Calderón 487** | lotes desde 324 m²; calles/luminaria/muro | pendiente | pendiente | No contado |
| **Condominio Av. 25 de Mayo 2100** | 14 parcelas ~300 m²; escritura/portón/calle interna declarados | ≥0.42 ha privativas + comunes | pendiente | No contado |
| **Condominio Lezica y Juan B. Justo** | oferta pública de condominio privado | pendiente | pendiente | No contado |
| **Altos de Espora** | desarrollo histórico de gran escala, caso frontera | ~45 ha publicitadas históricamente | frontera urbano/rural | No contado hasta reconstruir vigencia/límite |

## Caso documental fuerte: Urban Green

El EIA de enero de 2020 identifica explícitamente el proyecto como **Club de campo y Reservorio hídrico URBAN GREEN**, sobre la parcela 790, con unas 23.90 ha y 76 unidades. El mismo estudio describe el predio como fuertemente degradado/decapitado por actividad extractiva.

La reconstrucción del Anexo I 11.819/20 ubica la parcela 790 dentro de **Zona de Recuperación**. Por ello el proyecto se registra como caso conocido que no consume el cupo Productivo ordinario en el modelo. La auditoría administrativa deberá comprobar el acto definitivo de aprobación y su tratamiento contable municipal.

## Candidatos ML dentro de Productivo

El ML temporal detectó un cluster meridional coherente de transformación física. Se conservan sólo positivos humanos y strong candidates relevantes:

| Partida | Área | Señal | Cronología principal | Estado |
| --- | ---: | --- | --- | --- |
| 003017527 | 10.059549 ha | strong + positivo humano | calles 2020→2022; ocupación 2022→2023 | investigar identidad/expediente |
| 003017519 | 10.107831 ha | strong + positivo humano | calles + ocupación 2020→2022 | investigar identidad/expediente |
| 003143927 | 3.191975 ha | intermedio + positivo humano | trama/ocupación ya desde 2016, consolidación posterior | investigar identidad/expediente |
| 003076135 | 3.099944 ha | strong temporal | calles 2016→2020; ocupación 2020→2022 | investigar identidad/expediente |
| 003017516 | 10.104240 ha | strong temporal | calles 2022→2023; ocupación 2023→2026 | investigar identidad/expediente |
| 003139476 | 9.033293 ha | strong temporal | calles 2022→2023; ocupación 2023→2026 | investigar identidad/expediente |

**Área bruta conjunta de parcelas candidatas: 45.596832 ha.**

Si, sólo como stress test, toda esa superficie terminara perteneciendo a Clubes de Campo imputables al régimen ordinario, equivaldría al **34.98% del benchmark Productivo de 130.3584699 ha**. No se usa como numerador real hasta identificar proyecto, polígono y expediente.

El caso `003143929` se excluye del conjunto positivo: la validación humana muestra invernaderos/cubiertas productivas y no una red interna compatible con loteo.

## Control externo sobre loteos no registrados como Club de Campo

En septiembre de 2026 el Municipio informó públicamente que existían **18 causas penales vinculadas con loteos irregulares y violaciones de clausuras** y más de 20 actuaciones administrativas. Esto refuerza la necesidad de mantener dos indicadores separados:

- `club_campo_quota_10`: sólo Clubes de Campo imputables al régimen del cupo;
- `physical_residential_transformation`: loteos/urbanizaciones observables, aunque no sean Club de Campo o carezcan de registro.

La capa ML pertenece al segundo indicador hasta que el cruce administrativo demuestre lo contrario.

## Gap crítico

La detección VHR/ML aún cubre sólo 74 parcelas Productivo (67 completas + 7 parciales) de las 520. Por eso el siguiente paso de cobertura no es mejorar el modelo actual sino **replicar el pipeline validado al resto de la Zona Productiva**, manteniendo la validación humana y el cruce administrativo.

## Fuentes web verificadas en este corte

- Resolución provincial 560/2021: https://normas.gba.gob.ar/ar-b/resolucion/2021/560/269322
- EIA Urban Green (copia pública): https://es.scribd.com/document/445794151/00-EIA-Club-de-campo-y-reservorio-Mtro-Rivadavia-Alte-Brown
- Barrio Parque América: https://barrioparqueamerica.com.ar/
- Estancias del Sur (oferta vigente): https://terreno.mercadolibre.com.ar/MLA-3554794524-venta-de-lotes-100-financiados-_JM
- Portal del Sol I: https://terreno.mercadolibre.com.ar/MLA-1513345362-lotes-condominio-portal-del-sol-escritura-financiacion-exclusiva-venta-ramayo-propiedades-_JM
