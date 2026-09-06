# Loteos detectados — primer cruce con GeoARBA

Estado: **inventario público confirmado / parcelas todavía no atribuidas salvo Saint Henri**.

## Objetivo

Aplicar a los demás desarrollos detectados la misma cadena probatoria usada en Saint Henri:

`fuente comercial o institucional -> coordenada verificable -> parcela GeoARBA -> zonificación histórica -> expediente -> transformación física`.

No se atribuye una parcela por semejanza de dirección, nombre comercial o cercanía visual.

## Casos prioritarios

| Desarrollo | Referencia pública inicial | Oferta observada | Estado de georreferenciación |
| --- | --- | --- | --- |
| Barrio Parque América | Brig. Gral. Manuel Calderón 1101 | lotes desde ~300 m²; barrio perimetrado | dirección confirmada; parcela pendiente |
| La Ramona | Rivera 860 | 50 lotes; ~300 m²; barrio cerrado | dirección comercial confirmada; parcela pendiente |
| Barrio Don Vicente | Brig. Gral. Manuel Calderón 3422 | 14 lotes; ~360 m²; semi-cerrado | dirección confirmada; parcela pendiente |
| Portal del Sol I | Av. Chivilcoy 578 / Chivilcoy y Juan B. Justo | ~680 m²; acceso controlado | referencia confirmada; parcela pendiente |
| Estancias del Sur | Av. Chivilcoy y Brig. Gral. Manuel Calderón | ~300–320 m²; urbanización protegida | intersección confirmada; parcela pendiente |
| Altos de Espora | Av. Espora 7300/7800 | loteo publicitado de ~45 ha, mezcla de lotes y barrios cerrados | caso frontera urbano/rural; polígono pendiente |
| Condominio 25 de Mayo | Av. 25 de Mayo 2100 | 14 parcelas publicitadas de ~300 m² | referencia vial confirmada; parcela pendiente |

Los tamaños publicitados son señales de clasificación, **no pruebas de incumplimiento**. R6, ZRE, suelo rural productivo y categorías de recuperación/usos específicos tienen parámetros distintos y además debe preservarse la norma vigente en la fecha de cada actuación.

## Resultado del primer geocoder automático

Se implementó una sonda `Nominatim/OSM -> GeoARBA` para estas referencias. El resultado fue deliberadamente conservador: el geocoder público no resolvió con precisión suficiente la mayoría de las direcciones/nombres y no produjo anclas catastrales confiables.

Por esa razón el sistema **no asignó ninguna parcela** a estos desarrollos. El fallo es útil: evita convertir una geocodificación de calle o un centroide aproximado en una falsa identificación catastral.

## Procedimiento siguiente

Para cada caso se usará al menos una de estas anclas fuertes:

1. coordenada explícita incluida en una publicación;
2. esquina exacta de dos calles con geometría vial verificable;
3. polígono visible del desarrollo en imagen de alta resolución;
4. plano comercial georreferenciable contra calles/pista/curso de agua;
5. nomenclatura/partida publicada en expediente, mensura o aviso con respaldo documental.

Una vez obtenida el ancla se intersectará contra `public/data/geoarba/ministro-rivadavia-parcels.geojson` y se conservarán nomenclatura, partida, superficie, tipo y geometría.

## Prioridad analítica

Después del hallazgo de Saint Henri, la prioridad cambia: para auditar el **consumo del 10%** conviene buscar primero desarrollos que caigan sobre **Zona Productiva u otra superficie computable**, porque los proyectos sobre Recuperación/Equipamiento/Uso Específico podían quedar fuera del cupo bajo el régimen histórico de la Ordenanza 11.819/20.

Por eso el orden sugerido es:

- Altos de Espora: resolver primero si está realmente en área urbana o si alguna parte entra al Parque Rural;
- corredor Calderón–Chivilcoy–Juan B. Justo: localizar Estancias del Sur, Parque América, Don Vicente y Portal del Sol;
- corredor 25 de Mayo: separar R6, ZRE y Parque Rural antes de evaluar tamaños de lote;
- La Ramona: ubicar el polígono real sobre Rivera y clasificarlo normativamente.

## Regla probatoria

`dirección confirmada` ≠ `parcela confirmada` ≠ `polígono confirmado` ≠ `expediente localizado` ≠ `legalidad determinada`.

Cada salto debe conservar su evidencia propia.
