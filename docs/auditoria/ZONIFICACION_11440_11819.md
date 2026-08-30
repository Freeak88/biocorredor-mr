# Georreferenciación normativa — Ordenanzas 11.440/19 y 11.819/20

Estado: **reglas textuales verificadas; vectorización parcelaria exacta en curso**.

## Objetivo

Convertir la normativa territorial en una capa GIS versionada que permita resolver, para cada parcela GeoARBA, qué zonificación histórica le correspondía y qué consecuencia tiene para el análisis del cupo. La regla central es no asignar una zona por proximidad visual cuando puede resolverse mediante nomenclatura catastral o un polígono normativo georreferenciado.

## Ordenanza 11.440/19 — datos verificables

Fuente oficial municipal:

https://www.almirantebrown.gov.ar/uploads/hcd/ordenanzas/5d3e9171bb99c_ORD%2011440.pdf

Identificadores del propio documento:

- Expediente D.E. 4003-1596/19.
- Expediente HCD 20984/19.

### R6

La norma incorpora Zona Residencial 6 y describe sus polígonos mediante calles y referencias catastrales. Para R6 establece:

- frente mínimo: 12 m;
- superficie mínima: 300 m².

El propio texto remite al Anexo I, Plano nº 2.

### Zona Residencial Extraurbana (ZRE)

El artículo 5 crea la ZRE en el área rural de Ministro Rivadavia, Circunscripción IV, y define el polígono por calles. El carácter de la zona admite clubes de campo y barrios cerrados. Para uso residencial establece:

- frente mínimo: 20 m;
- superficie mínima: 600 m².

El texto remite al Anexo I, Plano nº 3 y además enumera parcelas afectadas por restricciones de la red vial jerarquizada, lo que aporta puntos de control catastrales para la georreferenciación.

## Ordenanza 11.819/20

La auditoría utiliza el ejemplar documental ya incorporado al trabajo como fuente primaria. La norma debe transformarse en una capa histórica separada de 11.440/19. Se conservarán como atributos, como mínimo:

- categoría territorial;
- tratamiento en el cálculo del cupo;
- contexto para superficie privativa mínima;
- fuente, página/anexo y fecha de vigencia;
- grado de evidencia de la transcripción.

Categorías implementadas inicialmente en el motor: `productiva`, `recuperacion`, `equipamiento`, `uso_especifico`, `preservacion`. Cualquier parcela que no pueda asociarse sin ambigüedad permanece `unknown`.

## Arquitectura de datos

El resolver se implementa en `src/lib/territorialZoning.ts`.

Cada asociación normativa deberá guardar:

```text
cadastralKey
ordinance
zone
evidenceGrade
sourceUrl
sourcePage
note
```

Los grados de evidencia permitidos son:

- `official_text`: surge directamente del articulado;
- `official_annex_transcription`: surge de una transcripción controlada del plano/anexo;
- `cadastral_join`: resultado de un cruce exacto contra GeoARBA;
- `pending_review`: todavía requiere revisión.

## Estrategia de georreferenciación

### Fase A — límites descriptos por calles

1. Crear una capa de líneas/ejes con las calles citadas en cada ordenanza.
2. Resolver nombres históricos, calles sin nombre y calles a abrir mediante cartografía contemporánea a la norma y referencias parcelarias.
3. Cerrar los polígonos sólo cuando la descripción textual permita hacerlo sin ambigüedad.

### Fase B — puntos de control catastrales

Usar las parcelas que la propia norma enumera como restricciones, excepciones o límites para verificar que el polígono cae sobre la Circunscripción/Sección correctas.

### Fase C — anexos gráficos

Georreferenciar los planos oficiales como raster de referencia y digitalizar sus límites. La capa resultante debe almacenar el error de ajuste y los puntos de control utilizados.

### Fase D — cruce GeoARBA

La salida final no debe depender únicamente del raster. Se intersecta con el parcelario GeoARBA ya incorporado al proyecto y se genera una tabla parcelaria versionada. Si una parcela queda cortada por un límite o existe conflicto entre texto y plano, se marca para revisión manual.

## Controles de calidad

- nunca inferir zona a partir de la dirección comercial solamente;
- nunca usar el lote ofrecido comercialmente como sustituto de la parcela matriz;
- conservar las geometrías de 2019, 2020 y 2024 como capas distintas;
- registrar vigencia temporal: presentación, factibilidad, aprobación y estado actual pueden estar bajo normas diferentes;
- un conflicto de fuentes debe producir `unknown/conflict`, no una clasificación automática.

## Estado actual

El motor ya conoce las reglas verificadas de R6/ZRE y dispone de un resolver exacto por clave catastral. Todavía no se cargaron asociaciones parcelarias masivas: hacerlo antes de terminar la transcripción/georreferenciación de anexos introduciría falsos positivos.

El siguiente archivo de datos deberá ser `src/data/territorialZoningRecords.ts`, generado únicamente a partir de asociaciones revisadas.
