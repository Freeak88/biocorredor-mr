# BioCorredor MR — QA internal road score V5

Estado: **PASS COMO SEÑAL AUXILIAR ESTABILIZADA EN CLUSTER 2**
Scope: **Productivo only**
Referencia actual: `2026-01-11`

## Resultado numérico

V5 combina persistencia temporal OpenEarthMap, probabilidad `Road` 2026, soporte geométrico V4 y earthwork 2023→2026.

Métricas:
- `road_argmax_fraction_productivo`: **0.041182**;
- `high_fraction_productivo`: **0.019658**;
- `medium_fraction_productivo`: **0.013779**;
- `low_fraction_productivo`: **0.005761**;
- cobertura HIGH sobre Road 2026: **47.73%**;
- cobertura MEDIUM sobre Road 2026: **33.46%**;
- cobertura LOW sobre Road 2026: **13.99%**;
- `unsupported_new_2026_fraction_productivo`: **0.006935**.

`score_p95_productivo = 0.0` no implica falla: el score es deliberadamente disperso y se anula fuera de `Road` 2026; más del 95% del scope Productivo no contiene señal vial actual. Para QA del detector son más informativas las fracciones HIGH/MEDIUM/LOW y la distribución condicionada a `Road`.

## QA visual

Gate visual: **PASS**.

Lectura:
- HIGH (verde) sigue mayormente redes viales internas continuas y consolidadas;
- MEDIUM (cian) conserva corredores plausibles con menor soporte temporal/geométrico;
- LOW (amarillo) concentra buena parte de los tramos dudosos, aislados o con soporte débil;
- los falsos positivos rectos sobre campos observados en la capa temporal quedan en general degradados respecto de los corredores persistentes;
- la cuadrícula urbana/productiva real se recupera de forma más limpia que con V4 aislado.

Persisten algunos trazos lineales débiles sobre campos o límites; no deben convertirse en calle final sin contexto parcelario y otras señales.

## Decisión

`internal_road_score` queda **estabilizado para Cluster 2** como feature física auxiliar.

No seguir iterando thresholds de calle antes de probar agregación por parcela. El siguiente gate debe ser **parcelario piloto dentro de la cobertura de Cluster 2**, no sobre las 520 parcelas completas: las 520 definen el universo Productivo, pero el mosaico histórico actual cubre sólo Cluster 2. Las parcelas fuera de ese bbox no deben recibir ceros ni interpretarse como ausencia de transformación.

Próxima etapa:
1. intersectar parcelas Productivo con bbox/scope efectivo de Cluster 2;
2. agregar `internal_road_score`, HIGH/MEDIUM/LOW y earthwork por parcela intersectada;
3. incorporar superficie cubierta 2023 donde exista;
4. validar ranking parcelario del piloto;
5. recién después escalar adquisición/inferencia al resto del Productivo.

## Restricciones

No interpretar V5 como porcentaje loteado, superficie vendida, aprobación, irregularidad o ilegalidad. Es evidencia física auxiliar dentro del scope Productivo.
