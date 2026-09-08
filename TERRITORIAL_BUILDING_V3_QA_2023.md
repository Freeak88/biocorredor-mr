# QA visual — edificios V3 Productivo — 2023-04-19

Estado: revisión visual completada sobre overlay general + muestra intencional de 40 objetos.
Scope: exclusivamente Zona Productiva.

## Insumos revisados

- overlay completo V3 sobre mosaico 2023;
- panel de 40 objetos con prioridad a objetos grandes + muestra distribuida;
- QA JSON generado localmente;
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

Ejemplos visuales claros en la muestra:
- alrededor del caso #15 aparece una detección irregular sobre suelo/campo que no debe interpretarse como edificio;
- alrededor del caso #19 aparece una detección sobre una pileta/superficie de agua.

### Separación de instancias

**NO APROBADA TODAVÍA PARA CONTEO DE OBJETOS.**

Los objetos grandes del ranking están dominados por invernaderos y complejos productivos reales. En varios casos el vector resultante agrupa múltiples módulos/cubiertas adyacentes dentro de una sola instancia o sigue puentes de probabilidad entre cubiertas cercanas.

Consecuencia:
- `objects_inside_productivo = 290` NO debe interpretarse como cantidad real de edificios;
- `raw_instance_labels = 790` tampoco representa edificios reales;
- para métricas parcelarias de superficie, la unión de área detectada puede seguir siendo útil tras QA;
- para clasificación por objeto y conteos hace falta mejorar el postproceso de instancias o trabajar explícitamente con `covered_surface_complex` / complejos productivos.

## Métricas de la corrida revisada

- parcelas Productivo: `520`;
- objetos vectorizados actuales: `290`;
- parcelas con al menos una detección: `49`;
- superficie detectada actual: `60,381.44 m²`;
- muestra visual: `40` objetos;
- los 8 objetos más grandes de la muestra suman aproximadamente `23,895.80 m²` y corresponden principalmente a grandes cubiertas/invernaderos, por lo que dominan fuertemente el área detectada.

La cifra `60,381.44 m²` queda **provisional** hasta separar o etiquetar falsos positivos no edilicios y confirmar la estrategia de medición de complejos productivos.

## Overture

El QA local reportó `overture_available = false`; por lo tanto esta revisión no incluye comparación auxiliar con Overture. Esto no bloquea el gate visual contra imagen, pero la comparación debe hacerse antes de congelar el producto final de edificios 2023 si el archivo auxiliar está disponible localmente o puede recuperarse.

## Decisión de gate

- Georreferencia: **PASS**.
- Máscara/segmentación V3 como evidencia de superficie cubierta: **PASS CON QA**.
- Threshold `0.4371`: **se mantiene** como baseline operativo.
- Vectorización geográfica: **PASS**.
- Conteo/separación de instancias: **FAIL / ITERAR**.
- Cifra de área construida: **PROVISIONAL**.
- Uso jurídico/administrativo: **NO APLICA**; esta subcapa no prueba loteo, venta, aprobación ni ilegalidad.

## Próximo paso técnico

1. No repetir inferencia V3.
2. Mantener la máscara/probabilidad actual.
3. Mejorar postproceso de instancias para evitar fusiones grandes y marcar explícitamente complejos productivos/invernaderos.
4. Añadir filtros/etiquetas de falsos positivos frecuentes (pileta/agua, suelo desnudo, superficie no edilicia).
5. Comparar con Overture como referencia auxiliar cuando esté disponible.
6. Recalcular área parcelaria separando al menos:
   - `building_or_roof_surface_m2`;
   - `greenhouse_or_productive_cover_m2`;
   - `probable_nonbuilding_surface_m2`;
   - `uncertain_surface_m2`.
7. Sólo después congelar la subcapa de edificios 2023.

Los edificios siguen siendo sólo una señal del análisis territorial. El objetivo principal continúa siendo detectar transformación física y señal de loteo físico dentro de Productivo, incluyendo calles internas, movimiento de suelo, infraestructura, cercos y patrón de subdivisión.
