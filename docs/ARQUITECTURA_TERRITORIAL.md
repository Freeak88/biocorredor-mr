# Capa territorial y estrategia de proteccion

## Alcance

El mapa territorial del MVP se organiza en seis familias de capas:

1. Parcelas catastrales.
2. Zonificacion vigente.
3. Ordenanza 11.819/20 y anexos.
4. Cursos de agua, inundabilidad y forestacion.
5. Biodiversidad y ambientes.
6. Obras, cambios territoriales y expedientes.

Las capas externas se registran con fuente, organismo, fecha de verificacion, version, servicio geografico y licencia. No se copian datos de terceros sin registrar su procedencia y condiciones de uso.

## Fuentes de referencia

- IDEBA/GeoARBA: catastro y cartografia provincial.
- urBAsig: zonificacion, hidrologia, areas protegidas y urbanizaciones cerradas.
- Boletin Oficial y normativa provincial/municipal: ordenanza, anexos, resoluciones y expedientes.

La disponibilidad de un servicio WMS/WFS no implica que el dato sea completo, vigente para un caso particular o suficiente para una conclusion administrativa. Cada ficha debe mostrar `fuente`, `fecha de consulta` y `nivel de confianza`.

## Vinculacion espacial

```text
observacion (punto GPS)
    -> point-in-polygon contra parcelas
    -> zonificacion y categoria normativa
    -> restricciones ambientales e hidraulicas
    -> expedientes, permisos y cambios territoriales
```

El resultado se guarda como contexto de la observacion, con version de las capas usadas. Si la precision GPS no permite resolver una parcela, el sistema debe devolver `indeterminado` y conservar la coordenada reservada para curaduria.

## Proteccion de coordenadas

- Coordenada reservada: solo equipo autorizado y curaduria.
- Coordenada publica: generalizada segun la precision definida por proyecto.
- Las especies sensibles y ambientes vulnerables se publican siempre de forma generalizada.
- Las alertas son indicadores de verificacion documental, nunca declaraciones de ilegalidad.

## Alertas de verificacion

El motor puede generar alertas por reglas versionadas:

| Regla | Prioridad | Interpretacion |
|---|---:|---|
| Obra sin expediente asociado | media | Documentacion pendiente |
| Intervencion en zona de preservacion | alta | Riesgo territorial a revisar |
| Relleno proximo a curso de agua | alta | Revision hidraulica |
| Desmonte sobre forestacion protegida | alta | Evidencia prioritaria |
| Urbanizacion con aprobacion preliminar | media | Verificar ausencia de obras/ventas |
| Proyecto sin DIA publicada | media | Requerir informacion |
| Cambio posterior a linea de base | alta | Comparacion antes/despues |

## Privacidad y titularidad

La plataforma no debe inferir titularidad privada ni publicar datos personales desde una capa catastral. La ficha de parcela distingue `titularidad_documentada`, `fuente_titularidad` y `fecha_verificacion`; los valores ausentes quedan como `no_documentado`.

