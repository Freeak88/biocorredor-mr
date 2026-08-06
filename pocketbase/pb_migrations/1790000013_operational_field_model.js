/// <reference path="../pb_data/types.d.ts" />

function field(name, type, required = false) {
  return new Field({ name, type, required, hidden: false, presentable: false });
}

function selectField(name, values, required = false) {
  return new SelectField({ name, values, required, maxSelect: 1, hidden: false, presentable: false });
}

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

function ensureSelectValues(collection, name, values) {
  const existing = collection.fields.find((field) => field.name === name);
  if (!existing || !Array.isArray(existing.values)) return;
  values.forEach((value) => {
    if (!existing.values.includes(value)) existing.values.push(value);
  });
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("survey_events");
  [
    field("protocol_code", "text"),
    field("protocol_version", "text"),
    field("app_version", "text"),
    selectField("sampling_method", ["free_search", "transect", "fixed_point", "plot", "bioblitz"]),
    field("sampling_effort_value", "number"),
    selectField("sampling_effort_unit", ["observer_minutes", "kilometres", "square_metres", "point_minutes"]),
    field("habitat_summary", "json"),
  ].forEach((item) => add(events, item));
  app.save(events);

  const occurrences = app.findCollectionByNameOrId("occurrences");
  [
    field("paper_id", "text"),
    field("scientific_name_proposed", "text"),
    field("basis_of_record", "text"),
    selectField("identification_qualifier", ["unknown", "sp", "cf", "aff", "tentative", "probable"]),
    field("evidence_types", "json"),
    selectField("count_method", ["exact", "estimated", "range", "cover"]),
    field("geodetic_datum", "text"),
    field("location_captured_at", "date"),
    field("manual_location_reason", "text"),
    selectField("completeness_status", ["complete", "usable", "incomplete", "review"]),
    field("record_version", "number"),
  ].forEach((item) => add(occurrences, item));
  ensureSelectValues(occurrences, "taxon_group", ["plant", "arthropod"]);
  app.save(occurrences);

  const media = app.findCollectionByNameOrId("media_evidence");
  [
    field("media_id", "text"),
    field("original_local_blob_key", "text"),
    field("ingested_at", "date"),
    field("view_type", "text"),
  ].forEach((item) => add(media, item));
  app.save(media);

  const identifications = app.findCollectionByNameOrId("identifications");
  [
    field("identification_id", "text"),
    field("date_identified", "date"),
    field("reference_source", "text"),
  ].forEach((item) => add(identifications, item));
  app.save(identifications);

  const changes = app.findCollectionByNameOrId("territorial_changes");
  [field("change_id", "text"), field("record_version", "number")].forEach((item) => add(changes, item));
  app.save(changes);
}, (app) => {
  // Additive migration: operational data is retained on rollback.
});
