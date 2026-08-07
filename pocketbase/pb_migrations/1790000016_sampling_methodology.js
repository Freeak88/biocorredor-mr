/// <reference path="../pb_data/types.d.ts" />

function field(name, type, required = false) {
  return new Field({ name, type, required, hidden: false, presentable: false });
}

function selectField(name, values, required = false) {
  return new SelectField({ name, values, required, maxSelect: 1, hidden: false, presentable: false });
}

function relation(name, collectionId, required = false) {
  return new RelationField({ name, collectionId, required, maxSelect: 1, cascadeDelete: false });
}

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

function ensureSelectValues(collection, name, values) {
  const existing = collection.fields.find((item) => item.name === name);
  if (!existing || !Array.isArray(existing.values)) return;
  values.forEach((value) => {
    if (!existing.values.includes(value)) existing.values.push(value);
  });
}

migrate((app) => {
  const authed = "@request.auth.id != ''";
  const coordinators = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";
  const strata = new Collection({
    type: "base", name: "strata", listRule: authed, viewRule: authed,
    createRule: coordinators, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      field("code", "text", true), field("name", "text", true), field("description", "editor"),
      field("habitat_class", "text"), field("geometry_geojson", "json"), field("active", "bool"),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_strata_code ON {{strata}} (code)"],
  });
  app.save(strata);

  const samplingUnits = new Collection({
    type: "base", name: "sampling_units", listRule: authed, viewRule: authed,
    createRule: coordinators, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      field("code", "text", true), relation("stratum_id", strata.id),
      selectField("unit_type", ["point", "line", "plot", "route"], true),
      selectField("selection_method", ["opportunistic", "random", "stratified_random", "systematic", "fixed"], true),
      field("geometry_geojson", "json"), field("latitude", "number"), field("longitude", "number"),
      field("length", "number"), field("width", "number"), field("area", "number"), field("radius", "number"),
      field("replicate_no", "number"), field("permanent", "bool"), field("protocol_code", "text"), field("protocol_version", "text"), field("active", "bool"),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_sampling_units_code ON {{sampling_units}} (code)"],
  });
  app.save(samplingUnits);

  const events = app.findCollectionByNameOrId("survey_events");
  [
    selectField("inventory_mode", ["opportunistic", "standardized"]),
    relation("stratum_id", strata.id), relation("sampling_unit_id", samplingUnits.id),
    selectField("sampling_design", ["opportunistic", "random", "stratified", "systematic", "fixed"]),
    field("sampling_effort_value", "number"),
    selectField("sampling_effort_unit", ["minutes", "observer_minutes", "meters", "kilometers", "square_meters", "points", "other"]),
    field("observers_count", "number"), field("ended_at", "date"), field("weather", "text"), field("limitations", "editor"),
    field("protocol_code", "text"), field("protocol_version", "text"),
  ].forEach((item) => add(events, item));
  ensureSelectValues(events, "sampling_method", ["free_search", "transect", "plot", "fixed_point", "acoustic_point", "other"]);
  app.save(events);

  const occurrences = app.findCollectionByNameOrId("occurrences");
  add(occurrences, field("morphospecies_code", "text"));
  add(occurrences, field("evidence_type", "text"));
  app.save(occurrences);
}, (app) => {
  // Additive migration: offline and historical records remain valid on rollback.
});
