export const SAMPLING_EFFORT_UNITS = [
  'minutes',
  'observer_minutes',
  'meters',
  'kilometers',
  'square_meters',
  'points',
  'point_minutes',
  'other',
] as const;

export type SamplingEffortUnit = typeof SAMPLING_EFFORT_UNITS[number];

export const SAMPLING_EFFORT_UNIT_MEANINGS: Record<SamplingEffortUnit, string> = {
  minutes: 'Duración cronológica del evento.',
  observer_minutes: 'Suma del tiempo de observación de todos los observadores.',
  meters: 'Distancia lineal relevada en metros.',
  kilometers: 'Distancia lineal relevada en kilómetros.',
  square_meters: 'Superficie relevada en metros cuadrados.',
  points: 'Cantidad de puntos o unidades puntuales relevados.',
  point_minutes: 'Cantidad de puntos multiplicada por su duración.',
  other: 'Unidad extraordinaria documentada en sampling_effort_notes.',
};
