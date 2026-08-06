/// <reference path="../pb_data/types.d.ts" />

function addFieldIfMissing(collection, field) {
  if (!collection.fields.find((existing) => existing.name === field.name)) {
    collection.fields.add(field);
  }
}

function findOptionalCollection(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch {
    return null;
  }
}

function textField(name) {
  return new Field({ name, type: "text", required: false, hidden: false, presentable: false });
}

function jsonField(name) {
  return new Field({ name, type: "json", required: false, hidden: false, presentable: false });
}

function dateField(name) {
  return new Field({ name, type: "date", required: false, hidden: false, presentable: false });
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("survey_events");
  ["meeting_point", "objective", "restricted_zones", "unvisited_sectors", "incidents", "time_sync_status", "protocol_hash", "manifest_id", "closed_by"].forEach((name) => addFieldIfMissing(events, textField(name)));
  ["equipment_json", "public_geometry_geojson", "reserved_geometry_geojson"].forEach((name) => addFieldIfMissing(events, jsonField(name)));
  addFieldIfMissing(events, dateField("closed_at"));
  app.save(events);

  const occurrences = app.findCollectionByNameOrId("occurrences");
  ["public_latitude", "public_longitude", "gps_accuracy_m"].forEach((name) => addFieldIfMissing(occurrences, new Field({ name, type: "number", required: false, hidden: false, presentable: false })));
  addFieldIfMissing(occurrences, jsonField("reserved_coordinates"));
  app.save(occurrences);

  const users = app.findCollectionByNameOrId("users");
  ["device_id", "device_model", "consent_version", "consent_status"].forEach((name) => addFieldIfMissing(users, textField(name)));
  addFieldIfMissing(users, dateField("consent_at"));
  app.save(users);

  if (!findOptionalCollection(app, "participant_consents")) {
    const consents = new Collection({
      type: "base", name: "participant_consents",
      listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''", updateRule: "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'administrador' || @request.auth.role = 'admin'",
      fields: [
        new RelationField({ name: "user", collectionId: users.id, required: true, maxSelect: 1 }),
        textField("consent_version"), textField("consent_text_hash"), textField("device_id"), dateField("accepted_at"),
      ],
      indexes: ["CREATE INDEX idx_participant_consents_user ON {{participant_consents}} (user)"],
    });
    app.save(consents);
  }
}, (app) => {
  // This migration is additive; rollback is intentionally omitted to avoid deleting field data.
});
