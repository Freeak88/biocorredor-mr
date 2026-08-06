/// <reference path="../pb_data/types.d.ts" />

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

migrate((app) => {
  const occurrences = app.findCollectionByNameOrId("occurrences");
  add(occurrences, new Field({ name: "sync_status", type: "text" }));
  add(occurrences, new Field({ name: "conditional_data_json", type: "json" }));
  add(occurrences, new Field({ name: "public_latitude", type: "number" }));
  add(occurrences, new Field({ name: "public_longitude", type: "number" }));
  app.save(occurrences);

  const changes = app.findCollectionByNameOrId("territorial_changes");
  add(changes, new Field({ name: "sync_status", type: "text" }));
  add(changes, new Field({ name: "public_latitude", type: "number" }));
  add(changes, new Field({ name: "public_longitude", type: "number" }));
  app.save(changes);

  const media = app.findCollectionByNameOrId("media_evidence");
  add(media, new Field({ name: "sync_status", type: "text" }));
  app.save(media);

  const events = app.findCollectionByNameOrId("survey_events");
  events.updateRule = 'status != "sealed" && (@request.auth.id != "" )';
  app.save(events);
}, (app) => {
  // Operational records are retained on rollback.
});
