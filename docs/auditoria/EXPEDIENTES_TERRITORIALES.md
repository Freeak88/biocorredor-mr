# Matriz de expedientes territoriales — Ministro Rivadavia

Estado: **búsqueda abierta / sin atribuir expedientes por nombre comercial cuando no existe correspondencia oficial inequívoca**.

## Método

Un nombre comercial no es una clave administrativa confiable. Para cada desarrollo se buscan y conservan, por separado:

1. nombre comercial y variantes;
2. desarrollador / razón social cuando esté documentada;
3. domicilio o referencia geográfica;
4. nomenclatura catastral matriz y resultantes;
5. expediente D.E.;
6. expediente HCD;
7. ordenanza/resolución/decreto;
8. expediente o acto provincial;
9. DIA / actuaciones ambientales;
10. actuaciones hidráulicas;
11. tratamiento dentro o fuera del cupo territorial.

Si una búsqueda pública por nombre no devuelve un acto inequívoco, el expediente queda `no localizado por clave pública` y no se asigna por semejanza.

## Casos

| Caso | Claves públicas iniciales | Nomenclatura exacta | Expte. D.E./HCD | Acto oficial específico | Estado |
| --- | --- | --- | --- | --- | --- |
| Saint Henri Aero & Country Club | Saint Henri; Saint Henri Aero; Aeroclub Longchamps–La Caída; Estanislao San Zeballos 1320 | pendiente | pendiente | no localizado de forma inequívoca por nombre comercial | prioridad |
| Altos de Espora | Altos de Espora; Ministro Rivadavia / límite Longchamps | pendiente | pendiente | pendiente | prioridad |
| Barrio Parque América | Parque América; Brigadier Calderón 1101 | pendiente | pendiente | pendiente | prioridad |
| Estancias del Sur | Estancias del Sur; Chivilcoy y Brigadier Calderón | pendiente | pendiente | pendiente | prioridad |
| La Ramona | La Ramona; Rivera 860 | pendiente | pendiente | pendiente | prioridad |
| Barrio Don Vicente | Don Vicente; Brigadier Calderón 3422 | pendiente | pendiente | pendiente | parcial |
| Condominio Av. 25 de Mayo | Av. 25 de Mayo 2100 | pendiente | pendiente | pendiente | prioridad |
| Portal del Sol I | Portal del Sol I; Av. Chivilcoy 578 | pendiente | pendiente | pendiente | parcial |

## Saint Henri — resultado de esta iteración

Las búsquedas en fuentes oficiales indexadas por `Saint Henri`, variantes del nombre, dirección comercial y referencias al Aeroclub no devolvieron todavía un expediente municipal/provincial que pueda atribuirse al desarrollo con certeza.

Eso no demuestra inexistencia del expediente. Las hipótesis de recuperación más plausibles son:

- el trámite figura bajo otra razón social o titular dominial;
- el acto está indexado sólo por número de expediente/nomenclatura;
- existe una actuación no publicada o no indexada;
- el desarrollo tramita sobre una parcela matriz cuyo nombre comercial no aparece en el acto.

Por eso la prioridad cambia de `buscar nombre del barrio` a `resolver parcela matriz -> buscar nomenclatura/partida -> recuperar expediente`.

## Claves normativas ya identificadas

### Ordenanza 11.440/19

El propio documento oficial informa:

- Expte. D.E. **4003-1596/19**;
- Expte. HCD **20984/19**.

Estos números corresponden a la modificación normativa general y **no deben confundirse** con un expediente de Saint Henri.

### Ordenanza 13.378/24

La Resolución provincial 511/2024 convalida esta ordenanza como modificación de la normativa de ordenamiento territorial de Almirante Brown. También es normativa general, no evidencia de aprobación individual de ninguno de los casos anteriores.

## Próximo ataque documental

Para cada caso:

```text
ubicación comercial
  -> polígono aproximado sólo para navegación
  -> GeoARBA
  -> nomenclatura/partida matriz
  -> búsqueda exacta por nomenclatura y titular/razón social
  -> expediente municipal
  -> HCD
  -> acto provincial
  -> ambiente/hidráulica
  -> fecha + superficie + tratamiento del cupo
```

La matriz sólo cambiará a `documentado` cuando al menos un identificador administrativo oficial cierre la cadena con la parcela correspondiente.
