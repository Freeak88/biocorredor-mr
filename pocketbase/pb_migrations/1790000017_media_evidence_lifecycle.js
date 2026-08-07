/// <reference path="../pb_data/types.d.ts" />

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

migrate((app) => {
  const media = app.findCollectionByNameOrId("media_evidence");
  [
    new Field({ name: "parent_type", type: "text" }),
    new Field({ name: "parent_local_id", type: "text" }),
    new Field({ name: "local_id", type: "text" }),
    new Field({ name: "server_id", type: "text" }),
    new Field({ name: "original_sha256", type: "text" }),
    new Field({ name: "retry_count", type: "number" }),
    new Field({ name: "last_sync_error", type: "text" }),
  ].forEach((item) => add(media, item));
  const syncStatus = media.fields.find((field) => field.name === "sync_status");
  if (syncStatus && Array.isArray(syncStatus.values) && !syncStatus.values.includes("pending_hash")) syncStatus.values.push("pending_hash");
  app.save(media);
}, (app) => {
  // Additive migration: local evidence metadata remains valid on rollback.
});
