# Anexo I 11.819/20 — estimación raster provisional por categoría

Estado: **estimación exploratoria**, no reemplaza vectorización catastral ni mensura.

## Objetivo

Estimar órdenes de magnitud de superficie por categoría del Anexo I de la Ordenanza 11.819/20 antes de completar la georreferenciación parcela por parcela.

## Fuente base

- Ordenanza 11.819/20, Anexo I (página cartográfica 9/11).
- Atlas Ambiental de Almirante Brown 2019: Parque Rural de Ministro Rivadavia ≈ **2.600 ha**.
- Como control de incertidumbre se considera también la cifra de **2.500 ha** usada en literatura académica reciente.

## Método

1. Se renderizó la página del Anexo I a 220 dpi.
2. Se identificaron cuatro colores de relleno de la leyenda:
   - Zona Productiva;
   - Zona de Recuperación;
   - Uso Específico;
   - Equipamiento.
3. Se clasificaron los píxeles del cuerpo cartográfico por distancia RGB respecto de muestras internas de cada categoría.
4. Se excluyeron blancos, líneas, textos, arroyos y límites mediante umbral de similitud cromática.
5. Se repitió el cálculo con umbrales 35, 45 y 55 para medir sensibilidad.
6. Las proporciones de píxeles clasificados se transformaron en hectáreas usando 2.600 ha como escala principal; se construyó además un rango usando 2.500–2.600 ha.

## Resultado central (umbral 45, base 2.600 ha)

| Categoría | Proporción raster | Estimación |
| --- | ---: | ---: |
| Zona Productiva | 44,91 % | **1.168 ha** |
| Zona de Recuperación | 43,06 % | **1.120 ha** |
| Uso Específico | 10,08 % | **262 ha** |
| Equipamiento | 1,95 % | **51 ha** |
| **Total** | **100 %** | **2.600 ha** |

## Rango de sensibilidad

Combinando los umbrales cromáticos 35–55 y una superficie total del Parque Rural entre 2.500 y 2.600 ha:

| Categoría | Mínimo provisional | Máximo provisional |
| --- | ---: | ---: |
| Zona Productiva | **1.107 ha** | **1.183 ha** |
| Zona de Recuperación | **1.069 ha** | **1.132 ha** |
| Uso Específico | **230 ha** | **282 ha** |
| Equipamiento | **44 ha** | **55 ha** |

## Lectura para el cupo

El artículo 3.1 de la 11.819/20 permitía, bajo evaluación y aprobación, localizar clubes de campo fuera del porcentaje ordinario en zonas de recuperación y superficies afectadas a equipamiento o usos específicos.

Con esta estimación raster, la suma de las tres categorías potencialmente excepcionables es del orden de:

**Recuperación + Uso Específico + Equipamiento ≈ 1.433 ha (55,1 % del Parque Rural).**

La Zona Productiva sería del orden de **1.168 ha**. Si se tomara como referencia un 10 % ordinario aplicado a esa base productiva —solo como escenario de control y no como interpretación jurídica definitiva— serían ≈ **117 ha**; un eventual 5 % adicional serían ≈ **58 ha**. La ordenanza, sin embargo, define el cupo sobre la superficie bruta rural con exclusiones, por lo que el cálculo jurídico exacto exige reconstruir el denominador administrativo utilizado por el Municipio.

## Control externo

El orden de magnitud coincide con trabajos críticos sobre la 11.819/20 que estimaron más de 1.400 ha potencialmente habilitables para urbanizaciones cerradas al sumar suelos degradados/recuperación y cupos sobre superficie productiva. Ese material se usa solo como control independiente, no como fuente de la medición raster.

## Limitaciones

- El plano escaneado tiene líneas, textos, sellos y cursos de agua que reducen área de relleno visible.
- La clasificación por color no reconoce límites catastrales.
- La cifra 2.600 ha es aproximada.
- No se ha corregido todavía deformación del escaneo mediante puntos de control catastrales.
- No debe usarse esta tabla para afirmar superficie legal de un expediente individual.

## Próximo paso

Vectorizar el Anexo I contra GeoARBA y sumar `ARA` parcela por parcela. Esa segunda medición permitirá reemplazar esta estimación raster por una superficie catastral reproducible y detectar parcelas parcialmente afectadas.
