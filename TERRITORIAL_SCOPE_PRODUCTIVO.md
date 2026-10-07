# BioCorredor MR — Scope Lock: suelo Productivo

Estado: ACTIVO

Este archivo fija el alcance espacial del análisis territorial de loteo.

## Regla única

El análisis principal se realiza **exclusivamente sobre la geometría de suelo `Productivo` derivada de la cartografía de la ordenanza ya digitalizada e incorporada al proyecto**.

```text
fuera de Productivo -> fuera del indicador
intersecta Productivo -> analizar sólo la porción incluida en Productivo
```

## Consecuencias

- El denominador del porcentaje de loteo es la superficie Productivo.
- Una parcela parcialmente incluida aporta sólo su superficie intersectada con Productivo.
- Construcciones, caminos internos, nivelación, postes, cercos y patrones de subdivisión sólo computan en el indicador cuando se encuentran dentro de Productivo.
- Otras categorías normativas pueden visualizarse como contexto, pero no integran el cálculo.
- No volver a ampliar el universo de análisis por inferencia, conveniencia técnica o feedback informal sin una decisión metodológica explícita.

## Definición operativa de loteo físico

Dentro de Productivo, `loteado` no se limita a construcción presente. Pueden ser evidencia:
- movimiento/nivelación de suelo;
- apertura de trazas o calles internas;
- infraestructura visible;
- muros/cercos;
- subdivisiones físicas repetitivas;
- construcciones;
- combinación de señales.

Estas señales describen transformación física observable y no prueban por sí solas legalidad, aprobación, venta ni situación administrativa.

## Precedencia

Si cualquier otro documento técnico del proyecto resulta ambiguo respecto del universo espacial del análisis, prevalece este scope lock junto con `TERRITORIAL_LOTEO_CRITERIA.md`.