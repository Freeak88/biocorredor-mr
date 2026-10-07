# QA — corredores internos dentro de parcela madre GeoARBA

Estado: **PASS COMO RANKING DIAGNÓSTICO PARA REVISIÓN DIRIGIDA**

Scope: Productivo dentro de la cobertura real de Cluster 2.
Referencia: 2026-01-11.

## Método

La señal `internal_road_score` V5 HIGH+MEDIUM se corta por parcela GeoARBA actual y se priorizan segmentos que:

- atraviesan el interior de una parcela suficientemente grande;
- tienen longitud relevante;
- se mantienen alejados del borde parcelario durante una fracción significativa;
- tienen soporte temporal reciente;
- conservan score V5 suficiente.

Esto no determina si una calle está declarada, aprobada, vendida o es irregular. La categoría operativa es `internal_road_within_mother_parcel_candidate`.

## Resultado Cluster 2

- segmentos analizados: **75**
- segmentos de prioridad alta: **11**
- segmentos de prioridad media: **7**
- parcelas únicas con prioridad alta: **5**
- radio de interior: **16 px ≈ 7.84 m**
- superficie mínima de parcela madre: **10,000 m²**

Parcelas de prioridad alta detectadas:

- `003040000000000000000000000000000000816000`
- `003040000000000000000000000000000000818000`
- `003040000000000000000000000000000000819000`
- `00304000000000000000000000000000000082400B`
- `003040E00000000000000000600000000000001000`

## QA visual

El overlay muestra una mejora respecto de los contrastes previos basados sólo en cercanía a límites o morfología de componentes completos: el ranking concentra la revisión en un conjunto pequeño de parcelas actuales donde la señal vial física penetra en el interior parcelario.

No obstante, algunos candidatos altos corresponden visualmente a tramas urbanizadas consolidadas. Eso no invalida el ranking: puede significar que la cartografía parcelaria actual no refleja subdivisión interna observable o que la unidad GeoARBA representa una geometría mayor que la ocupación física. Por lo tanto, el ranking no debe usarse como prueba de 'calle no declarada'.

## Decisión

**PASS para revisión dirigida por parcela.**

Siguiente gate obligatorio: revisar temporalmente las 5 parcelas altas en 2016 / 2020 / 2022 / 2023 / 2026 y verificar si los corredores actuales:

1. ya existían antes de 2020;
2. aparecen en 2022/2023;
3. aparecen recién en 2026;
4. se acompañan de consolidación física progresiva.

Sólo después de ese gate se integrará esta señal a un ranking parcelario más amplio con earthwork, cubiertas y demás señales físicas.
