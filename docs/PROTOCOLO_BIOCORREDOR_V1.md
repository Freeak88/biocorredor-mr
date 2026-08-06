# Protocolo de Relevamiento Comunitario v1.0

Proyecto: **Biocorredor de Ministro Rivadavia**  
Codigo: `INV-GENERAL`  
Version: `1.0`  
Fecha prevista de ensayo: 11 al 13 de agosto de 2026

## Objetivo

Registrar observaciones de biodiversidad y caracterizacion ambiental con trazabilidad de evento, equipo, dispositivo, evidencia original y estado de sincronizacion.

## Antes de salir

- Delimitar los sectores en el mapa y verificar acceso restringido.
- Asignar un codigo de equipo a cada grupo: `EQ-01`, `EQ-02`, etc.
- Publicar esta version del protocolo y conservar su hash.
- Registrar participantes, usuario, telefono y dispositivo.
- Descargar o precargar el mapa de sectores para consulta sin conexion.
- Ejecutar cinco observaciones de prueba y sincronizarlas.
- Sincronizar fecha y hora de todos los telefonos.
- Definir punto de encuentro, horario de inicio y horario de cierre.
- Separar geometria publica de coordenadas reservadas.

## Registro minimo del evento

Al iniciar: equipo, sector, hora de inicio, integrantes, protocolo y version, clima, tipo de ambiente y objetivo.

Al finalizar: hora de cierre, distancia recorrida, tiempo efectivo, cantidad de observadores, incidentes, sectores no recorridos y estado de sincronizacion.

## Registro minimo de una especie u organismo

Hora, coordenadas, precision GPS, fotografia original, organismo o grupo observado, sustrato o ambiente, cantidad aproximada, observador y evento al que pertenece.

La identificacion debe conservar el nivel de certeza real: grupo, morfoespecie, genero o especie. Los registros dudosos se marcan para revision y nunca se eliminan.

## Evidencia fotografica

Siempre que sea posible registrar: ambiente general, organismo completo, caracter diagnostico y escala.

Para hongos: sombrero, himenio, pie y base, sustrato y ambiente.  
Para plantas: porte general, hoja, tallo o corteza, flor o fruto y disposicion de las hojas.  
Para impactos territoriales: vista general, detalle, referencia de escala, orientacion y panorama previo/historico si existe.

Las imagenes se suben originales, sin editar. El sistema conserva hash SHA-256 y metadatos disponibles.

## Reglas de campo

- No editar imagenes antes de subirlas.
- No eliminar observaciones dudosas: marcar `pending_review`.
- No publicar coordenadas sensibles.
- No recolectar ejemplares sin protocolo especifico y responsable competente.
- No ingresar a propiedades cerradas sin autorizacion.
- No afirmar una especie mas alla de lo visible.
- No registrar ausencia fuera de una busqueda protocolizada.
- No mezclar observacion biologica con denuncia o interpretacion juridica.

## Cierre de jornada

La coordinacion debe sincronizar todos los telefonos, controlar eventos sin cierre, detectar duplicados, revisar coordenadas anomalas, generar hashes, bloquear originales, generar manifiesto, exportar CSV y GeoJSON, crear copia de respaldo y firmar el acta.

