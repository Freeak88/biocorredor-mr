# Anexo I Ordenanza 11.819/20 — vectorización parcelaria precisa

Estado: **reconstrucción geoespacial cerrada para uso de auditoría**. No sustituye mensura, plano aprobado ni la contabilidad administrativa municipal.

## Resultado

La versión pública deja de usar contornos raster aproximados. La clasificación se conserva **parcela por parcela contra la geometría GeoARBA actual** y, para entrega web, cada categoría se publica como la unión disuelta de esas parcelas con coordenadas WGS84 redondeadas a 6 decimales. Ese redondeo desplaza el borde menos de 0,1 m en la validación y no altera la clasificación.

| Categoría | Parcelas clasificadas | Superficie GeoARBA |
| --- | ---: | ---: |
| Zona Productiva | 520 | **1303.585 ha** |
| Zona de Recuperación | 205 | **1201.264 ha** |
| Equipamiento | 8 | **45.870 ha** |
| Uso Específico | 10 | **83.229 ha** |
| **Total clasificado** | **743** | **2633.947 ha** |
| Sin asignación por borde | **16** | **4.857 ha** |

Los 16 fragmentos no resueltos representan sólo **0.18%** del universo reconstruido y se conservan en una capa QA separada. No se los fuerza a una categoría.

## Registro del plano

1. Se usa la página cartográfica del Anexo I del escaneo oficial.
2. Se ajusta una transformación afín entre coordenadas GeoARBA y píxeles del Anexo.
3. El ajuste se optimiza contra bordes catastrales visibles del propio plano.
4. Se valida sobre **25 parcelas** distribuidas en el mapa.
5. La mediana de los residuos medianos por parcela es **0.3749 px**, equivalente a aproximadamente **1.34 m**; la media de esos residuos medianos es **0.4871 px** (~**1.74 m**).

Coeficientes reproducidos en `zonificacion-11819-qa.json`.

## Clasificación

La clase se obtiene sobre píxeles interiores de cada parcela, alejados de bordes, textos y trazos. Para asignación automática se exige simultáneamente:

- fracción dominante ≥ 0,70;
- cobertura útil ≥ 0,30;
- dominancia entre píxeles clasificados ≥ 0,65;
- margen sobre la segunda clase ≥ 0,30.

Las parcelas de **Uso Específico** se sometieron además a revisión visual porque el gris del plano se confunde fácilmente con textos y líneas del escaneo. Quedaron confirmadas 666, 670E, 769–775 y 824A. En Equipamiento se revisaron manualmente 741 y 742B.

## Corrección relevante

La extracción raster inicial subestimaba **Uso Específico**. La reconstrucción cerrada identifica **83.229 ha**, incluyendo el bloque 769–775. Sólo 770–775 suman 44,535 ha; al incluir 769, el bloque 769–775 suma 54,867 ha.

## Proxy espacial del cupo

Si se usa la Zona Productiva reconstruida únicamente como **proxy de control**:

- Productiva confirmada: **1303.585 ha**;
- máximo conservador si los 4.857 ha no resueltos fueran todos Productiva: **1308.442 ha**;
- 10% del proxy: **130.358–130.844 ha**;
- 15% hipotético: **195.538–196.266 ha**.

### Hipótesis actualizada sobre el 10%

Dentro de la Productiva reconstruida hay **184 parcelas GeoARBA actualmente clasificadas como `Urbano`**, que suman **122.535 ha**.

Comparadas con el 10% espacial de referencia (**130.358–130.844 ha**), quedan **7.823–8.309 ha por debajo**. Dicho de otro modo, el screening catastral actual representa aproximadamente **93.65–94.00%** del umbral espacial.

Por este indicador, **no se supera todavía el 10%**, pero la distancia al umbral es pequeña. Cualquier desarrollo adicional computable en Productiva de más de ~8.31 ha que no esté ya incluido en esas parcelas `Urbano` podría hacer cruzar el proxy. Esto vuelve especialmente decisivo cerrar el polígono, superficie y tratamiento administrativo de **Estancias del Sur**.

En paralelo, las parcelas `Urbano` actuales dentro de Recuperación + Equipamiento + Uso Específico suman **98.212 ha**. Se mantienen fuera del numerador ordinario de este screening y se auditan como posibles situaciones preexistentes, excepcionales o mal clasificadas.

**Esto no es el denominador ni el numerador jurídico del cupo.** La categoría catastral actual `Urbano` puede incluir tejido preexistente y no demuestra por sí misma aprobación bajo el régimen del 10%; también puede omitir proyectos todavía no vinculados. La Ordenanza remite a una base administrativa de superficie bruta rural con exclusiones y a imputaciones proyecto por proyecto. Para cerrar jurídicamente el 10% siguen siendo necesarios el decreto reglamentario, la memoria de cálculo y el ledger municipal de aprobaciones.

## Archivos publicados

- `public/data/auditoria/zonificacion-11819-productiva.geojson.gz`
- `public/data/auditoria/zonificacion-11819-recuperacion.geojson.gz`
- `public/data/auditoria/zonificacion-11819-equipamiento.geojson.gz`
- `public/data/auditoria/zonificacion-11819-uso-especifico.geojson`
- `public/data/auditoria/zonificacion-11819-ambiguas.geojson`
- `public/data/auditoria/zonificacion-11819-qa.json`
- `public/data/auditoria/zonificacion-11819-asignaciones.json.gz` (índice parcelario auditable)
- `scripts/validate_annex11819_final.py` (validación CI)

## Cautelas temporales

GeoARBA es un estado catastral posterior al Anexo de 2020. Cuando una parcela histórica fue subdividida, la reconstrucción aplica la categoría del plano al fragmento actual sólo si su posición y evidencia visual son consistentes. La capa es adecuada para auditoría territorial reproducible, no para afirmar por sí sola la situación jurídica de un inmueble.
