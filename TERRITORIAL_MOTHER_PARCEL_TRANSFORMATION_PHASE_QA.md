# QA de cronología física — parcelas madre candidatas (Cluster 2)

Estado: **PASS para cronología física auxiliar en las 5 parcelas madre HIGH del piloto**.
Scope: **Productivo únicamente, dentro de la cobertura real de Cluster 2**.

## Objetivo

Conservar por separado dos hitos de evidencia física por parcela:

- `road_emergence_interval`: primer intervalo en que el soporte vial sobre el footprint V5 2026 cruza el umbral operativo `0.35`;
- `occupation_takeoff_interval`: intervalo con mayor incremento positivo de `Building` semántico OpenEarthMap.

`Pavement` se usa como soporte auxiliar. Ninguno de estos hitos equivale a fecha de loteo, aprobación, subdivisión, venta, irregularidad o ilegalidad.

## Resultado

| Partida | Emergencia vial | Despegue de ocupación | Pavement principal | Perfil temporal | Building 2026 |
|---|---|---|---|---|---:|
| `003076135` | 2016→2020 | 2020→2022 | 2020→2022 | road first, then occupation | 0.168922 |
| `003017519` | 2020→2022 | 2020→2022 | 2020→2022 | **coupled road + occupation** | 0.101859 |
| `003017527` | 2020→2022 | 2022→2023 | 2020→2022 | road first, then occupation | 0.098699 |
| `003017516` | 2022→2023 | 2023→2026 | 2022→2023 | road first, then occupation | 0.019032 |
| `003139476` | 2022→2023 | 2023→2026 | 2023→2026 | road first, then occupation | 0.012776 |

## Lectura operativa

### 003017519
Caso temporalmente más acoplado del piloto. Entre 2020 y 2022 coinciden:
- cruce del umbral vial;
- mayor incremento de `Building` (`+0.046016`);
- mayor incremento de `Pavement` (`+0.074106`).

Esto constituye evidencia fuerte de **transformación física observable** concentrada en 2020→2022.

### 003017527
La red vial emerge con claridad en 2020→2022 y `Pavement` también tiene allí su mayor salto (`+0.098839`), mientras que el mayor incremento de ocupación semántica ocurre en 2022→2023 (`+0.040738`). Compatible con apertura/preparación primero y consolidación posterior.

### 003076135
Es la transformación más temprana del grupo: la señal vial cruza el umbral entre 2016 y 2020; la mayor expansión de `Building` y `Pavement` ocurre en 2020→2022 (`+0.066075` y `+0.081506`).

### 003017516
La red se vuelve claramente observable entre 2022 y 2023; el mayor incremento edilicio se desplaza a 2023→2026 (`+0.008600`). Señal compatible con apertura vial seguida de ocupación progresiva.

### 003139476
La red emerge 2022→2023, pero la ocupación observable continúa baja en 2026. El principal incremento de `Building` es 2023→2026 (`+0.009613`). Es un buen caso de **trama física previa a consolidación fuerte**.

## Gate

**PASS** para:
- usar `road_emergence_interval` y `occupation_takeoff_interval` como features separadas;
- priorizar casos de transición física;
- construir un esquema parcelario piloto dentro de Cluster 2.

No usar para:
- porcentaje loteado;
- superficie vendida;
- fecha jurídica de subdivisión;
- cumplimiento/incumplimiento de cupo;
- legalidad o irregularidad.

## Decisión metodológica

No fusionar los dos hitos en una única `first_change_date`. Una parcela puede tener camino/acceso previo y consolidación posterior. La salida parcelaria debe preservar, como mínimo:

```text
road_emergence_interval
occupation_takeoff_interval
pavement_takeoff_interval
temporal_profile
```

El siguiente gate es construir un **schema parcelario piloto** únicamente para las parcelas realmente cubiertas/analizadas en Cluster 2. El universo Productivo completo sigue siendo 520 parcelas, pero las parcelas sin cobertura VHR no deben recibir cero: deben marcarse como `not_observed` hasta contar con cobertura equivalente.
