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

| Caso | Claves públicas iniciales | Nomenclatura / partidas candidatas | Expte. D.E./HCD | Acto oficial específico | Estado |
| --- | --- | --- | --- | --- | --- |
| Saint Henri Aero & Country Club | Saint Henri; Saint Henri Aero; Aeroclub Longchamps–La Caída; Estanislao San Zeballos 1320; EQQUS Construcciones | Circ. IV parcelas 770, 772, 773, 774, 775, 776, 777; 792 como control sur. Partidas GeoARBA 003000600, 003075734, 003075735, 003018114, 003000684, 003075728, 003075729, 003075726 | individual pendiente | D-535/15-16 y D-671/17-18 son antecedentes legislativos de 776/777, **no** aprobación de Saint Henri | prioridad crítica |
| Altos de Espora | Altos de Espora; Ministro Rivadavia / límite Longchamps | pendiente | pendiente | pendiente | prioridad |
| Barrio Parque América | Parque América; Brigadier Calderón 1101 | pendiente | pendiente | pendiente | prioridad |
| Estancias del Sur | Estancias del Sur; Chivilcoy y Brigadier Calderón | pendiente | pendiente | pendiente | prioridad |
| La Ramona | La Ramona; Rivera 860 | pendiente | pendiente | pendiente | prioridad |
| Barrio Don Vicente | Don Vicente; Brigadier Calderón 3422 | pendiente | pendiente | pendiente | parcial |
| Condominio Av. 25 de Mayo | Av. 25 de Mayo 2100 | pendiente | pendiente | pendiente | prioridad |
| Portal del Sol I | Portal del Sol I; Av. Chivilcoy 578 | pendiente | pendiente | pendiente | parcial |

## Saint Henri — resultado de esta iteración

Las búsquedas en fuentes oficiales indexadas por `Saint Henri`, variantes del nombre, dirección comercial y referencias al Aeroclub no devolvieron todavía un expediente municipal/provincial individual que pueda atribuirse al desarrollo con certeza.

Eso no demuestra inexistencia del expediente. Las hipótesis de recuperación más plausibles son:

- el trámite figura bajo otra razón social o titular dominial;
- el acto está indexado sólo por número de expediente/nomenclatura;
- existe una actuación no publicada o no indexada;
- el desarrollo tramita sobre una parcela matriz cuyo nombre comercial no aparece en el acto.

La publicidad actual agrega una clave relevante: identifica a **EQQUS Construcciones** como desarrolladora y a **Díaz Mayer & Brie Propiedades** como comercializadora. Estas denominaciones deben incorporarse a la búsqueda, sin inferir titularidad dominial.

### Cluster GeoARBA acotado

La referencia oficial del aeródromo, el punto publicado de San Zeballos 1320 y muestras a lo largo de la pista intersectan parcelas rurales 770, 772, 773, 774, 775, 777 y 792. La parcela 776, contigua al oeste y con partida 003075728, se incorpora como candidata prioritaria por el antecedente legislativo que la vincula históricamente con la 777.

La suma de parcelas completas alcanzadas por las muestras es mayor que las 55 ha publicitadas y **no debe usarse como polígono del proyecto**. Para resolver la matriz hacen falta el plano de mensura/subdivisión y el expediente individual.

### Antecedentes de 776 y 777

El proyecto provincial D-535/15-16 individualizó expresamente:

- Circ. IV, parcela 777, partida 75729, matrícula (003) 52815;
- Circ. IV, parcela 776, partida 75728, matrícula (003) 52816.

Propuso su expropiación con destino a SER.CU.PO. El proyecto fue vetado por el Poder Ejecutivo en 2017. La reproducción D-671/17-18 fue aprobada por Diputados y remitida al Senado; su desenlace final continúa pendiente de cierre documental en esta auditoría.

La correspondencia de las partidas históricas con GeoARBA actual —003075729 y 003075728— es una pista robusta para reconstruir antecedentes de mensura y dominio. **No se atribuye ese expediente legislativo a Saint Henri.**

Por eso la prioridad pasa de `buscar nombre del barrio` a `resolver plano del emprendimiento -> parcelas matrices/resultantes -> buscar cada nomenclatura/partida y desarrollador -> recuperar expediente`.

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
  -> búsqueda exacta por nomenclatura + desarrollador/razón social + plano
  -> expediente municipal
  -> HCD
  -> acto provincial
  -> ambiente/hidráulica
  -> fecha + superficie + tratamiento del cupo
```

Para Saint Henri, las claves inmediatas de búsqueda son las partidas `003000600`, `003075734`, `003075735`, `003018114`, `003000684`, `003075728`, `003075729` y, como control, `003075726`, junto con `EQQUS` y `San Zeballos 1320`.

La matriz sólo cambiará a `documentado` cuando al menos un identificador administrativo oficial cierre la cadena con la parcela correspondiente.
