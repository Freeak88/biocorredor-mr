# BioCorredor MR — QA tabla parcelaria observada Cluster 2

Estado: **PASS COMO DATASET DE FEATURES OBSERVADAS; NO ES SCORE FINAL**

Scope: exclusivamente `Productivo`, y sólo parcelas con cobertura VHR efectiva dentro del mosaico histórico de Cluster 2.

## Resultado

La tabla expandida resolvió **74 parcelas Productivo observadas** en Cluster 2:

- 67 con cobertura proxy `observed_cluster02_full` (>=95%);
- 7 con cobertura `observed_cluster02_partial`;
- 21 con señal vial V5 HIGH+MEDIUM;
- 5 con al menos un corredor interno HIGH;
- 52 con `Building takeoff delta > 0.01` según OpenEarthMap.

Las restantes parcelas del universo canónico de 520 Productivo no aparecen en esta tabla y deben permanecer conceptualmente como `not_observed`, nunca como cero.

## Gate metodológico

La expansión del piloto pasa el gate porque:

1. conserva correctamente la semántica de cobertura y no extrapola fuera del mosaico;
2. reproduce los cinco casos fuertes ya validados visualmente;
3. integra por parcela señal vial, corredor interno, cronología `Road`, `Building` y `Pavement`;
4. permite construir controles positivos, intermedios y negativos dentro del mismo dominio espacial observado.

## Advertencia nueva importante

`52/74` parcelas muestran `Building takeoff delta > 0.01`. Esta proporción es demasiado alta para usar ese threshold de forma aislada como evidencia de transformación/loteo.

Conclusión operativa:

- `Building` de OpenEarthMap queda como señal semántica auxiliar;
- una variación de `Building` por sí sola **no** define caso positivo;
- los casos fuertes deben exigir convergencia de señales, priorizando `internal_road`, persistencia temporal, profundidad dentro de parcela y soporte visual;
- las parcelas con fuerte cambio de `Building` pero sin soporte vial deben formar un estrato de revisión específico para medir falsos positivos o transformaciones no viales.

## Próximo gate

Antes de calibrar cualquier `physical_loteo_score`:

1. estratificar las 67 parcelas completas en candidatos convergentes fuertes, intermedios, `occupation-only` y controles negativos;
2. mantener las 7 parciales fuera de calibración cuantitativa principal;
3. generar una muestra de QA humano balanceada por estrato;
4. medir precision@k y tasa de falsos positivos por señal;
5. sólo después definir pesos/calibración de un score territorial.

## Regla de interpretación

Toda salida sigue describiendo **evidencia física observable**. No equivale a porcentaje loteado, venta, aprobación, incumplimiento, irregularidad ni ilegalidad.
