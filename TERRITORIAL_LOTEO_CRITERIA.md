# BioCorredor MR — Criterios operativos para detectar loteo y transformación física

Estado: metodología activa.
Branch: `feature/validacion-territorial`.

## 1. Alcance normativo — regla de exclusión obligatoria

Para este proyecto, el universo de análisis del loteo es **exclusivamente el suelo identificado como `Productivo` en la cartografía de la ordenanza ya digitalizada e incorporada al mapa del proyecto**.

Regla operativa:

```text
¿la geometría/parcela intersecta la capa Productivo?
  sí -> entra al análisis territorial de loteo
  no -> queda fuera de este indicador
```

No deben incorporarse al denominador ni al numerador del indicador específico de loteo:
- otras categorías normativas;
- sectores de Recuperación;
- Uso Específico;
- Equipamiento;
- categorías mencionadas coloquialmente como "suelo decapitado";
- cualquier otra superficie situada fuera de la capa Productivo.

Esas capas pueden conservarse en el mapa como contexto, pero **no forman parte del universo estadístico de este análisis**.

La máscara/capa `Productivo` ya resuelta en el proyecto es el gate espacial previo a cualquier detección, clasificación, agregación o cálculo porcentual.

## 2. Propósito

Dentro del universo Productivo, el objetivo no es sólo detectar construcciones. Debemos reconocer señales físicas compatibles con preparación, subdivisión y ocupación del suelo.

La unidad final de análisis sigue siendo la parcela GeoARBA, pero cuando una transformación atraviese varias parcelas también se conservará la geometría continua como evidencia territorial.

## 3. Distinción obligatoria de conceptos

El sistema debe separar siempre:

1. **Pertenencia al universo Productivo**
   - proviene de la capa normativa ya digitalizada;
   - no se infiere desde imagen satelital.

2. **Transformación física observable**
   - movimientos o nivelación de suelo;
   - apertura de calles o trazas internas;
   - postes o infraestructura eléctrica visible;
   - muros, cercos y subdivisiones internas;
   - accesos repetidos;
   - lotes delineados físicamente;
   - construcciones y estructuras auxiliares;
   - otras huellas de preparación del terreno.

3. **Estado parcelario/catastral/administrativo**
   - división formal de parcelas;
   - partidas existentes;
   - expedientes, permisos o antecedentes administrativos.

4. **Comercialización/ocupación efectiva**
   - ventas, reservas, ocupación residencial o cualquier evidencia externa.

Ninguna dimensión sustituye automáticamente a otra.

## 4. Definición operativa de “loteado” para el análisis físico

Se usa la categoría de trabajo:

`physical_loteo_signal`

No significa loteo legal, aprobado ni vendido. Significa evidencia física compatible con preparación o estructuración del terreno para división/ocupación.

Se consideran señales:
- `earthwork_or_leveling`: topadora, nivelación, decapado o modificación clara del terreno;
- `internal_road_layout`: apertura o consolidación de calles internas;
- `utility_poles`: postes o infraestructura lineal visible;
- `walls_or_fences`: muros/cercos que estructuran lotes;
- `parcel_like_subdivision`: patrón repetitivo de fracciones de tamaño similar;
- `access_pattern`: accesos individuales repetidos desde calles internas;
- `building_presence`: construcciones existentes;
- `mixed_preparation`: combinación de varias señales.

La presencia de una vivienda **no es condición necesaria** para marcar transformación o loteo físico.

Ejemplo:

```text
sin viviendas
+ suelo nivelado
+ calles internas
+ postes
+ subdivisiones visibles
= physical_loteo_signal alto
```

pero:

```text
legal_status = unknown
commercialization_status = unknown
```

## 5. Regla espacial del cálculo porcentual

Toda métrica de loteo se calcula únicamente dentro de la geometría Productivo.

Para parcelas parcialmente intersectadas, conservar dos magnitudes:
- superficie total de parcela;
- superficie de parcela incluida en Productivo.

El denominador territorial del indicador debe usar **superficie Productivo**, no la superficie completa de parcelas que sólo la intersectan parcialmente.

Flujo:

```text
capa Productivo ya digitalizada
  -> recorte espacial de parcelas y detecciones
  -> imágenes históricas
  -> señales físicas de transformación
  -> agregación sólo dentro de Productivo
  -> porcentaje de transformación/loteo físico observable
  -> alerta y revisión humana
```

## 6. Cambio requerido en el pipeline

El detector de edificios es una subcapa, no la definición de loteo:

```text
Productivo
  -> VHR histórica registrada
  -> edificios
  -> movimientos/nivelación de suelo
  -> calles/trazas internas
  -> cercos/muros
  -> infraestructura visible cuando la resolución lo permita
  -> patrón de subdivisión
  -> score de transformación física
  -> agregación por parcela y superficie Productivo
  -> comparación temporal
  -> revisión humana
```

Toda inferencia que caiga fuera de Productivo debe descartarse del indicador principal, aunque pueda conservarse como dato auxiliar de QA.

## 7. Variables mínimas por parcela/sector Productivo

- `partida`
- `productive_intersection_m2`
- `productive_intersection_pct_of_parcel`
- `earthwork_score`
- `internal_road_score`
- `utility_infrastructure_score`
- `walls_fences_score`
- `subdivision_pattern_score`
- `building_coverage_productive_pct`
- `physical_transformation_productive_pct`
- `physical_loteo_score`
- `physical_loteo_confidence`
- `first_transformation_date`
- `latest_transformation_date`

No necesitamos una variable multicategoría `normative_land_category` para decidir el universo del indicador: todos los registros analíticos principales deben pertenecer a `Productivo`.

## 8. Temporalidad

La serie histórica debe distinguir:
- aparición de calles antes de viviendas;
- nivelación previa a subdivisión;
- postes antes de ocupación;
- construcción posterior;
- densificación de un loteo ya preparado.

Esto permite detectar el inicio de la transformación y no sólo el momento en que aparecen techos.

## 9. Lenguaje de salida

Usar:
- `transformación física observable`;
- `señales de preparación para subdivisión`;
- `urbanización observable`;
- `ocupación física detectada`;
- `señal de loteo físico`.

No usar automáticamente:
- ilegal;
- clandestino;
- usurpado;
- vendido;
- aprobado;
- en negro.

## 10. Gate metodológico vigente

Antes de producir cualquier indicador territorial:

1. usar como máscara espacial la capa `Productivo` ya digitalizada;
2. recortar parcelas y detecciones a esa geometría;
3. medir señales físicas sólo dentro de ese universo;
4. mantener construcción, trazas, movimiento de suelo e infraestructura como evidencias distintas;
5. agregar temporalmente por parcela/sector Productivo;
6. someter los casos relevantes a validación humana.

No se abre nuevamente el universo a otras categorías de suelo salvo una decisión metodológica explícita posterior.

Este documento complementa `TERRITORIAL_ML_MASTER_PLAN.md` y prevalece en caso de cualquier ambigüedad sobre el alcance espacial del indicador de loteo.