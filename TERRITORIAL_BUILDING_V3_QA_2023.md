# QA visual — edificios V3 Productivo — 2023-04-19

Estado: revisión visual completada sobre overlay general + muestra intencional de 40 objetos + comparación auxiliar con Overture + panel dirigido de desacuerdos.
Scope: exclusivamente Zona Productiva.

## Insumos revisados

- overlay completo V3 sobre mosaico 2023;
- panel de 40 objetos con prioridad a objetos grandes + muestra distribuida;
- QA JSON generado localmente;
- Overture buildings recuperado como referencia auxiliar;
- panel dirigido de 40 desacuerdos V3 ↔ Overture;
- threshold V3: `0.4371`;
- vectorización actual: watershed sobre máscara + signed distance.

## Resultado general

### Georreferencia / alineación espacial

**APROBADA.**

Los contornos V3 se alinean de forma consistente con techos, galpones e invernaderos visibles. No se observa un corrimiento sistemático entre imagen y vector. Esto es coherente con el QA numérico previo de la georreferencia (`delta ≈ 0.210 x 0.293 px`).

### Segmentación de superficie construida / cubierta

**APROBADA COMO SUBCAPA DE EVIDENCIA, CON FALSOS POSITIVOS CARACTERIZADOS.**

Fortalezas observadas:
- muy buena respuesta sobre cubiertas grandes, galpones e invernaderos;
- buena detección sobre viviendas y estructuras medianas/pequeñas;
- continuidad razonable de los contornos;
- no se observa cuadrícula dominante de tiling en el overlay general.

Falsos positivos visibles a controlar:
- superficies de agua/piletas;
- suelo desnudo o preparado con textura/contraste fuerte;
- algunas formas irregulares junto a áreas productivas;
- posibles superficies brillantes no edilicias.

Ejemplos visuales claros en la muestra general:
- alrededor del caso #15 aparece una detección irregular sobre suelo/campo que no debe interpretarse como edificio;
- alrededor del caso #19 aparece una detección sobre una pileta/superficie de agua.

### Separación de instancias

**NO APROBADA PARA CONTEO DE OBJETOS, PERO NO BLOQUEA EL USO DE LA SUBCAPA COMO SUPERFICIE CUBIERTA.**

Los objetos grandes del ranking están dominados por invernaderos y complejos productivos reales. En varios casos el vector resultante agrupa múltiples módulos/cubiertas adyacentes dentro de una sola instancia o sigue puentes de probabilidad entre cubiertas cercanas.

Consecuencia:
- `objects_inside_productivo = 290` NO debe interpretarse como cantidad real de edificios;
- `raw_instance_labels = 790` tampoco representa edificios reales;
- para métricas parcelarias de superficie, la unión de área detectada sigue siendo útil tras QA;
- para clasificación por objeto y conteos hace falta mejorar el postproceso de instancias o trabajar explícitamente con `covered_surface_complex` / complejos productivos.

Dado que el objetivo territorial principal es detectar **transformación física observable y señal de loteo físico**, no se prioriza por ahora perfeccionar el conteo individual de edificios. La subcapa de cubiertas puede continuar como una señal más del sistema mientras se avanza sobre movimiento de suelo, calles internas, infraestructura, cercos y patrón de subdivisión.

## Métricas de la corrida revisada

- parcelas Productivo: `520`;
- objetos vectorizados actuales: `290`;
- parcelas con al menos una detección: `49`;
- superficie detectada actual: `60,381.44 m²`;
- muestra visual general: `40` objetos;
- los 8 objetos más grandes de la muestra suman aproximadamente `23,895.80 m²` y corresponden principalmente a grandes cubiertas/invernaderos, por lo que dominan fuertemente el área detectada.

La cifra `60,381.44 m²` queda **provisional** hasta separar o etiquetar falsos positivos no edilicios y confirmar la estrategia de medición de complejos productivos.

## Comparación auxiliar con Overture

La segunda corrida de QA encontró Overture disponible y produjo:

- `overture_features_in_bbox`: **1544**;
- objetos V3 con cualquier solapamiento Overture: **279 / 290 = 96.2%**;
- objetos V3 con solapamiento >= 50%: **229 / 290 = 79.0%**;
- mediana de fracción V3 cubierta por Overture: **0.7436**;
- objetos V3 sin ningún solapamiento Overture: **11**;
- objetos V3 con solapamiento < 50%: **61**.

Lectura metodológica:
- el 96.2% con algún apoyo espacial Overture refuerza que la segmentación V3 está capturando mayoritariamente superficies edificadas/cubiertas reales;
- el 79.0% con >=50% de solapamiento es un buen indicador auxiliar, pero no es una métrica de precisión porque Overture no es ground truth y puede fragmentar, omitir o simplificar estructuras;
- `overture_features_in_bbox=1544` no debe compararse directamente con `290` como recall, porque Overture incluye todos los footprints del bbox mientras V3 ya está recortado al scope Productivo y además la lógica de objetos/instancias difiere.

## Revisión dirigida de desacuerdos V3 ↔ Overture

Panel revisado:
- **11** objetos sin solapamiento Overture;
- **50** objetos adicionales con solapamiento `< 50%`;
- selección visual: los 11 sin overlap + los peores casos hasta completar 40.

### Hallazgo principal

El desacuerdo bajo con Overture **no equivale a falso positivo V3**. En la mayoría de los casos de bajo overlap del panel, el contorno rojo V3 sigue visualmente una cubierta real mientras el footprint Overture aparece desplazado, parcial, fragmentado, simplificado o ausente.

Patrones observados:

1. **Cubierta real omitida o representada de forma distinta por Overture.** Muy frecuente en viviendas pequeñas/medianas, anexos y cubiertas productivas. En el panel de bajo overlap se ven numerosos contornos V3 bien apoyados en la imagen aunque el cian cubra sólo una parte o esté corrido.
2. **Invernaderos / complejos productivos.** Algunos desacuerdos grandes corresponden a cubiertas reales extensas donde V3 sigue la superficie visible y Overture representa módulos parciales o con otra segmentación. El caso dirigido #1 es un ejemplo claro de cubierta productiva real sin overlap Overture suficiente.
3. **Falsos positivos V3 reales.** Existen y están caracterizados: suelo desnudo/preparado junto a invernaderos (casos dirigidos #2 y #3 son ejemplos claros), además de algunas superficies de agua/piletas o elementos no edilicios.
4. **Objetos pequeños ambiguos.** Tanques, piletas, sombras, superficies claras y anexos chicos requieren etiqueta `uncertain_surface` hasta revisión humana o clasificación posterior.
5. **Fusión / representación parcial.** En algunos complejos la diferencia proviene menos de un error de máscara y más de que V3 agrupa una superficie continua mientras Overture la separa en varios footprints.

### Consecuencia metodológica

No corresponde usar una regla automática del tipo `overture_overlap < 0.5 => descartar`. Eso eliminaría cubiertas reales. Overture queda como feature/QA auxiliar, nunca como filtro duro.

La clasificación operativa para la subcapa debe separar al menos:
- `building_or_roof_surface`;
- `greenhouse_or_productive_cover`;
- `probable_nonbuilding_surface`;
- `uncertain_surface`.

Para el objetivo de auditoría territorial, la presencia de una cubierta productiva sigue siendo transformación física observable, aunque no sea vivienda y aunque Overture la represente de otra manera.

## Decisión de gate

- Georreferencia: **PASS**.
- Máscara/segmentación V3 como evidencia de superficie cubierta: **PASS CON QA**.
- Threshold `0.4371`: **se mantiene** como baseline operativo.
- Vectorización geográfica: **PASS**.
- Apoyo auxiliar Overture: **FUERTE (96.2% con algún solapamiento)**.
- Revisión dirigida de desacuerdos: **COMPLETA**.
- Conteo/separación de instancias: **NO APROBADO PARA CONTEO, NO BLOQUEANTE PARA SUPERFICIE**.
- Cifra de área construida: **PROVISIONAL**.
- Uso jurídico/administrativo: **NO APLICA**; esta subcapa no prueba loteo, venta, aprobación ni ilegalidad.

## Próximo paso técnico

1. No repetir inferencia V3.
2. Mantener máscara/probabilidad y `threshold=0.4371`.
3. No usar Overture como filtro duro.
4. Mantener la subcapa de cubierta como evidencia con clases de superficie y confianza.
5. Posponer la optimización fina del conteo de instancias hasta que sea necesaria para una salida específica.
6. Avanzar al siguiente bloque del objetivo territorial: **señales no edilicias de loteo físico**, comenzando por movimiento de suelo/nivelación y trazado de calles internas.
7. Cuando se consolide el score combinado, recalcular por parcela sólo dentro de Productivo:
   - `building_or_roof_surface_m2`;
   - `greenhouse_or_productive_cover_m2`;
   - `probable_nonbuilding_surface_m2`;
   - `uncertain_surface_m2`;
   - señales no edilicias;
   - `physical_loteo_score` y confianza.

Los edificios siguen siendo sólo una señal del análisis territorial. El objetivo principal continúa siendo detectar transformación física y señal de loteo físico dentro de Productivo, incluyendo calles internas, movimiento de suelo, infraestructura, cercos y patrón de subdivisión.
