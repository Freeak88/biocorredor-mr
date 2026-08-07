# Adenda para Aletheia - modelo de campos y reglas v1.0

Usar junto con el prompt maestro del MVP. La planilla `Modelo_campos_MVP_Biocorredor_MR_v1.xlsx` es el diccionario autoritativo de campos, catálogos, reglas y mapeo Darwin Core.

## Decisiones innegociables

1. Todo `event`, `occurrence`, `territorial_change` y `media` recibe un ULID/UUID local antes de intentar red.
2. La falta de GPS, foto o identificación no impide guardar; queda explícitamente pendiente.
3. `not_detected` solo se habilita con protocolo, objetivo y esfuerzo registrados.
4. Los archivos originales no se reemplazan. Las miniaturas son derivados.
5. Cada archivo obtiene SHA-256 antes del sellado.
6. La identificación taxonómica es una colección separada y versionada.
7. Los cambios territoriales son una colección separada de las observaciones biológicas.
8. Después de `sealed`, una corrección crea una versión nueva con motivo.
9. La sincronización es idempotente y nunca elimina la copia local antes de confirmar servidor.
10. Todos los registros comienzan con visibilidad `private`.

## Colecciones mínimas

```ts
type SyncStatus = 'local_only' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
type EventStatus = 'draft' | 'active' | 'completed' | 'reviewed' | 'sealed';
type OccurrenceStatus = 'detected' | 'not_detected';
type IdentificationStatus = 'unidentified' | 'tentative' | 'probable' | 'confirmed' | 'rejected';
type PublicVisibility = 'private' | 'team' | 'generalized_public' | 'validated_public';

interface SurveyEvent {
  id: string;
  eventId: string;
  parentEventId: string;
  projectId: string;
  protocolId: string;
  protocolVersion: string;
  siteId: string;
  teamId: string;
  participantIds: string[];
  startedAt: string;
  endedAt?: string;
  samplingMethod: 'free_search' | 'transect' | 'fixed_point' | 'plot' | 'bioblitz';
  samplingEffortValue?: number;
  samplingEffortUnit?: 'minutes' | 'observer_minutes' | 'meters' | 'kilometers' | 'square_meters' | 'points' | 'point_minutes' | 'other';
  samplingEffortNotes?: string;
  observersCount: number;
  weather?: string[];
  habitatSummary: string[];
  trackGeojson?: object;
  limitations?: string;
  status: EventStatus;
  syncStatus: SyncStatus;
  localCreatedAt: string;
  serverUpdatedAt?: string;
}

interface Occurrence {
  id: string;
  occurrenceId: string;
  eventId: string;
  observerId: string;
  observedAt: string;
  taxonGroup: 'plant' | 'bird' | 'mammal' | 'reptile' | 'amphibian' | 'arthropod' | 'fungi' | 'other';
  fieldName: string;
  scientificNameProposed?: string;
  identificationQualifier?: 'unknown' | 'sp' | 'cf' | 'aff' | 'tentative' | 'probable';
  occurrenceStatus: OccurrenceStatus;
  basisOfRecord: 'HumanObservation' | 'MachineObservation';
  evidenceTypes: Array<'visual' | 'photo' | 'audio' | 'trace' | 'nest' | 'other'>;
  quantityValue?: number;
  quantityUnit?: 'individuals' | 'colonies' | 'cover_percent' | 'signs';
  countMethod?: 'exact' | 'estimated' | 'range' | 'cover';
  habitat: string[];
  substrate?: string;
  microhabitat?: string;
  behavior?: string[];
  lifeStage?: string;
  sensitiveRecord: boolean;
  fieldNotes?: string;
  latitude?: number;
  longitude?: number;
  geodeticDatum: 'WGS84';
  coordinateUncertaintyM?: number;
  locationSource: 'gps' | 'exif' | 'manual' | 'estimated' | 'missing';
  locationCapturedAt?: string;
  manualLocationReason?: string;
  publicVisibility: PublicVisibility;
  publicCoordinatePrecisionM?: number;
  completenessStatus: 'complete' | 'usable' | 'incomplete' | 'review';
  syncStatus: SyncStatus;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface MediaEvidence {
  id: string;
  mediaId: string;
  occurrenceId?: string;
  changeId?: string;
  eventId: string;
  originalLocalBlobKey: string;
  serverFile?: string;
  previewFile?: string;
  sha256?: string;
  mimeType: string;
  fileSizeBytes: number;
  capturedAt?: string;
  ingestedAt: string;
  exifJson?: Record<string, unknown>;
  mediaType: 'photo' | 'audio' | 'video' | 'document';
  viewType?: string;
  isOriginal: boolean;
  syncStatus: SyncStatus;
}

interface Identification {
  id: string;
  identificationId: string;
  occurrenceId: string;
  scientificName: string;
  taxonRank: string;
  identifiedBy: string;
  dateIdentified: string;
  confidence: IdentificationStatus;
  diagnosticBasis?: string;
  referenceSource?: string;
  supersedesId?: string;
  createdAt: string;
}

interface TerritorialChange {
  id: string;
  changeId: string;
  eventId: string;
  observerId: string;
  changeType: 'clearing' | 'filling' | 'soil_movement' | 'road_opening' | 'fencing' | 'fire' | 'waste' | 'watercourse_change' | 'machinery' | 'construction' | 'vegetation_loss' | 'other';
  observedAt: string;
  latitude?: number;
  longitude?: number;
  coordinateUncertaintyM?: number;
  geometryGeojson?: object;
  estimatedAreaM2?: number;
  objectiveDescription: string;
  initialSeverity?: 'low' | 'medium' | 'high' | 'urgent';
  syncStatus: SyncStatus;
  publicVisibility: PublicVisibility;
  recordVersion: number;
}
```

## Campos condicionales

- Planta: `plantFamilyObserved`, `growthForm`, `phenology[]`, `coverPercent` solo con unidad de muestreo, `healthObservation[]`, `observedThreat[]`.
- Fauna: `activity[]`, `stratum`, `reproductiveEvidence[]`, `traceType[]`.
- Artrópodo: `developmentStage`, `associatedPlantOccurrenceId|associatedPlantText`, `observedInteraction`.
- Hongo/funga: `growthSubstrate`, `growthForm`, `hymenophoreType`, `sizeValueCm|sizeClass`, `surfaceTexture`, `odorObservation`, `hostTreeOccurrenceId|hostTreeText`.

## Campos de la ficha actual que NO se cargan como observación directa

- tendencia estable/aumento/retroceso;
- estado UICN o lista provincial;
- invasora/plaga;
- origen validado y endemismo;
- función ecológica inferida;
- micorriza por mera proximidad;
- comestibilidad o toxicidad;
- calificación jurídica de una intervención.

Estos datos se incorporan en revisión posterior con taxón validado, fuente, ámbito, fecha y responsable.

## Reglas críticas

- Guardar borrador local antes de toda validación de red.
- Semáforo GPS: verde ≤15 m; amarillo >15 y ≤50 m; rojo >50 m o manual.
- Si `sensitiveRecord=true`, forzar `publicVisibility=private|team` y no exponer coordenada real.
- Si `coverPercent` no tiene parcela/transecta/superficie, rechazar ese campo, no el registro completo.
- Si un evento está `sealed`, prohibir UPDATE directo; crear versión nueva.
- Si la subida de media falla, mantener `originalLocalBlobKey` y reintentar.
- Si se reintenta sincronización, usar `local_id`/`idempotency_key` y upsert por ID.
- Si hay conflicto, conservar ambas versiones y abrir revisión.
- No permitir sellar si faltan hashes, archivos o si los conteos no coinciden con el manifiesto.

## Exportación mínima

```text
export/
  events.csv
  occurrences.csv
  identifications.csv
  territorial_changes.csv
  occurrences.geojson
  territorial_changes.geojson
  records.json
  hashes.csv
  manifest.json
  media/originals/
  media/previews/
```

## Prueba de aceptación adicional: papel + QR

1. Escanear o ingresar `MR-20260815-P001`.
2. Crear registro digital vinculado al ID de papel.
3. Adjuntar imagen de la ficha.
4. Detectar si el ID ya existe y abrir conflicto, sin duplicar.
5. Registrar quién digitalizó, fecha y hora.
6. Conservar la transcripción y la imagen original de la ficha.
