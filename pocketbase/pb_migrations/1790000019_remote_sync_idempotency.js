/// <reference path="../pb_data/types.d.ts" />

const SYNC_STATES = ["local_only", "queued", "syncing", "synced", "retry", "conflict", "failed"];

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

function text(name) { return new Field({ name, type: "text", required: false, hidden: false, presentable: false }); }
function number(name) { return new Field({ name, type: "number", required: false, hidden: false, presentable: false }); }
function date(name) { return new Field({ name, type: "date", required: false, hidden: false, presentable: false }); }
function json(name) { return new Field({ name, type: "json", required: false, hidden: false, presentable: false }); }
function select(name) { return new SelectField({ name, values: SYNC_STATES, required: false, maxSelect: 1, hidden: false, presentable: false }); }

function ensureSelectValues(collection, name) {
  const field = collection.fields.find((existing) => existing.name === name);
  if (!field || !Array.isArray(field.values)) return;
  SYNC_STATES.forEach((value) => { if (!field.values.includes(value)) field.values.push(value); });
}

function ensureUniqueIndex(collection, name, field) {
  if (!collection.indexes.find((index) => index.includes(name))) {
    collection.indexes = [...collection.indexes, `CREATE UNIQUE INDEX ${name} ON {{${collection.name}}} (${field}) WHERE ${field} != ''`];
  }
}

function addSyncFields(collection, statusName) {
  [text("local_id"), text("device_id"), text("sync_key"), text("server_id"), select(statusName), number("retry_count"), text("last_sync_error"), date("last_sync_at"), date("remote_updated_at"), date("last_synced_remote_updated_at"), json("conflict_local_snapshot"), json("conflict_remote_snapshot"), date("conflict_detected_at")].forEach((field) => add(collection, field));
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("survey_events");
  const occurrences = app.findCollectionByNameOrId("occurrences");
  const changes = app.findCollectionByNameOrId("territorial_changes");
  const media = app.findCollectionByNameOrId("media_evidence");

  addSyncFields(events, "sync_status");
  addSyncFields(occurrences, "sync_status");
  addSyncFields(changes, "sync_status");
  addSyncFields(media, "sync_status");
  [events, occurrences, changes, media].forEach((collection) => ensureSelectValues(collection, "sync_status"));

  ensureUniqueIndex(events, "idx_survey_events_sync_key", "sync_key");
  ensureUniqueIndex(occurrences, "idx_occurrences_sync_key", "sync_key");
  ensureUniqueIndex(changes, "idx_territorial_changes_sync_key", "sync_key");
  ensureUniqueIndex(media, "idx_media_evidence_sync_key", "sync_key");
  [events, occurrences, changes, media].forEach((collection) => app.save(collection));
}, (app) => {
  // Additive migration: local and remote identity metadata remains valid on rollback.
});
