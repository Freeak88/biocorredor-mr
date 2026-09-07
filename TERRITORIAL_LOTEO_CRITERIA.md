# BioCorredor MR — Criterios operativos para detectar loteo y transformación física

Estado: borrador metodológico incorporado al proyecto.
Branch: `feature/validacion-territorial`.

## 1. Propósito

Este documento amplía el enfoque del pipeline territorial para evitar un sesgo exclusivamente edilicio. El objetivo no es sólo detectar construcciones, sino reconocer señales físicas de preparación, subdivisión y ocupación del suelo que puedan ser relevantes para una auditoría territorial.

La unidad final de análisis sigue siendo la parcela GeoARBA.

## 2. Distinción obligatoria de capas conceptuales

El sistema debe separar siempre:

1. **Clasificación normativa/cartográfica del suelo**
   - p. ej. suelo productivo, suelo decapitado u otra categoría que surja de la cartografía normativa vigente.
   - esta categoría no se infiere desde imagen satelital; debe provenir de la ordenanza/mapa oficial o una capa vectorial derivada de ella.

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
   - ventas, reservas, ocupación residencial o cualquier otra evidencia externa.

Ninguna de estas cuatro dimensiones debe sustituir automáticamente a las demás.

## 3. Definición operativa de “loteado” para el análisis físico

A partir del feedback territorial recibido, se incorpora una categoría de trabajo denominada:

`physical_loteo_signal`

No significa loteo legal, aprobado ni vendido. Significa que existe evidencia física compatible con preparación o estructuración del terreno para división/ocupación.

Se considerará señal de loteo físico cuando aparezca una o más de las siguientes evidencias, con nivel de confianza explícito:

- `earthwork_or_leveling`: topadora, nivelación, decapado o modificación clara del terreno;
- `internal_road_layout`: apertura o consolidación de calles/calles internas;
- `utility_poles`: postes o infraestructura lineal visible;
- `walls_or_fences`: muros/cercos que estructuran lotes;
- `parcel_like_subdivision`: patrón repetitivo de fracciones de tamaño similar;
- `access_pattern`: accesos individuales repetidos desde calles internas;
- `building_presence`: construcciones existentes;
- `mixed_preparation`: combinación de varias señales.

## 4. Regla de interpretación

La presencia de una vivienda no es condición necesaria para marcar transformación o loteo físico.

Ejemplo operativo:

- terreno sin viviendas;
- suelo nivelado;
- calles internas trazadas;
- postes colocados;
- subdivisiones visibles.

Resultado:

`physical_loteo_signal = high`

pero:

`legal_status = unknown`

`commercialization_status = unknown`

## 5. Integración con el límite porcentual

El cálculo del porcentaje sólo puede hacerse después de asignar correctamente la categoría normativa de suelo.

La cartografía normativa debe actuar como **gate previo**:

```text
parcela / superficie
  -> categoría normativa oficial
  -> sólo luego aplicar la regla porcentual correspondiente
  -> medir transformación física observable
  -> comparar con umbral normativo
```

El sistema no debe aplicar un mismo porcentaje a toda el área de estudio.

El feedback recibido indica como hipótesis de trabajo que existen sectores con distinto tratamiento, incluyendo suelo productivo sujeto a un límite porcentual y sectores identificados como “suelo decapitado” con reglas distintas. Esta interpretación debe verificarse contra el texto y mapas oficiales antes de presentarse como conclusión jurídica.

## 6. Cambio requerido en el pipeline ML

El pipeline de edificios sigue siendo útil, pero pasa a ser sólo una subcapa:

```text
VHR histórica
  -> registro
  -> detección de edificios
  -> detección de movimientos/nivelación de suelo
  -> detección de calles/trazas internas
  -> detección de cercos/muros
  -> detección de postes/infraestructura lineal cuando la resolución lo permita
  -> métricas morfológicas de subdivisión
  -> agregación por parcela
  -> score de transformación física
  -> cruce con categoría normativa oficial
  -> alerta para revisión humana
```

## 7. Nuevas variables por parcela

Agregar al dataset parcelario:

- `normative_land_category`
- `normative_source`
- `normative_map_version`
- `earthwork_score`
- `internal_road_score`
- `utility_infrastructure_score`
- `walls_fences_score`
- `subdivision_pattern_score`
- `building_coverage_pct`
- `physical_transformation_pct`
- `physical_loteo_score`
- `physical_loteo_confidence`
- `first_transformation_date`
- `latest_transformation_date`

## 8. Temporalidad

La serie histórica debe distinguir:

- aparición de calles antes de viviendas;
- nivelación previa a subdivisión;
- postes antes de ocupación;
- construcción posterior;
- densificación de un loteo ya preparado.

Esto permite detectar el inicio del proceso de transformación, no sólo el momento en que aparecen techos.

## 9. Lenguaje de salida

Usar:

- `transformación física observable`
- `señales de preparación para subdivisión`
- `urbanización observable`
- `ocupación física detectada`
- `señal de loteo físico`

No usar automáticamente:

- ilegal
- clandestino
- usurpado
- vendido
- aprobado
- en negro

salvo que exista evidencia administrativa independiente que lo sostenga.

## 10. Próximo gate

Antes de calcular el cumplimiento porcentual definitivo:

1. vectorizar/digitalizar los mapas normativos de la ordenanza vigente;
2. asignar a cada parcela su categoría normativa;
3. validar qué regla porcentual aplica a cada categoría;
4. recién entonces sumar las señales físicas detectadas dentro de cada categoría.

Este documento complementa `TERRITORIAL_ML_MASTER_PLAN.md` y debe considerarse parte del diseño metodológico activo del proyecto.
