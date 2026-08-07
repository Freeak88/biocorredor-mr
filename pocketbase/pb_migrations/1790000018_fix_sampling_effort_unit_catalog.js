/// <reference path="../pb_data/types.d.ts" />

const CANONICAL_SAMPLING_EFFORT_UNITS = [
  "minutes", "observer_minutes", "meters", "kilometers", "square_meters", "points", "point_minutes", "other",
];

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("survey_events");
  add(events, new Field({ name: "sampling_effort_notes", type: "text", required: false, hidden: false, presentable: false }));
  const unitField = events.fields.find((field) => field.name === "sampling_effort_unit");
  if (!unitField || !Array.isArray(unitField.values)) throw new Error("survey_events.sampling_effort_unit is not a select field");

  const aliases = { kilometres: "kilometers", square_metres: "square_meters" };
  app.findAllRecords(events).forEach((record) => {
    const current = record.get("sampling_effort_unit");
    if (aliases[current]) { record.set("sampling_effort_unit", aliases[current]); app.save(record); }
  });
  unitField.values = [...CANONICAL_SAMPLING_EFFORT_UNITS];
  app.save(events);
}, (app) => {
  // Additive correction: historical effort values remain represented by the canonical catalog.
});
