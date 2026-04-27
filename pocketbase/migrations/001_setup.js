/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // =============================================
  // sightings
  // =============================================
  const sightings = new Collection({
    name: "sightings",
    type: "base",
    fields: [
      { system: false, id: "user", name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "mushroom_name", name: "mushroom_name", type: "text", required: true, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "description", name: "description", type: "text", required: true, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "toxicity", name: "toxicity", type: "select", required: false, options: { maxSelect: 1, values: ["Comestible", "Tóxico", "Mortal", "Desconocido"] } },
      { system: false, id: "habitat", name: "habitat", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "features", name: "features", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "lat", name: "lat", type: "number", required: true, options: { min: null, max: null } },
      { system: false, id: "lng", name: "lng", type: "number", required: true, options: { min: null, max: null } },
      { system: false, id: "geohash", name: "geohash", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "images", name: "images", type: "file", required: false, options: { maxSelect: 10, maxSize: 5242880, mimeTypes: [] } },
      { system: false, id: "status", name: "status", type: "select", required: false, options: { maxSelect: 1, values: ["identified", "unconfirmed", "expert_verified", "draft"] } },
      { system: false, id: "network_id", name: "network_id", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "geofirmed_by", name: "geofirmed_by", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "geofirmed_at", name: "geofirmed_at", type: "date", required: false, options: { min: "", max: "" } },
      { system: false, id: "ai_analysis", name: "ai_analysis", type: "json", required: false, options: { maxSize: 0 } },
    ],
    indexes: [
      "CREATE INDEX idx_sightings_geohash ON sightings (geohash)",
      "CREATE INDEX idx_sightings_status ON sightings (status)",
    ],
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
  });
  app.dao.saveCollection(sightings);

  // =============================================
  // comments
  // =============================================
  const comments = new Collection({
    name: "comments",
    type: "base",
    fields: [
      { system: false, id: "sighting", name: "sighting", type: "relation", required: true, options: { collectionId: sightings.id, maxSelect: 1, minSelect: null, cascadeDelete: true } },
      { system: false, id: "user", name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "text", name: "text", type: "text", required: true, options: { min: null, max: 1000, pattern: "" } },
    ],
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != '' && @request.body.user:isset = false",
    updateRule: "@request.auth.id = user.id",
    deleteRule: "@request.auth.id = user.id || @request.auth.role = 'admin'",
  });
  app.dao.saveCollection(comments);

  // =============================================
  // chat_messages
  // =============================================
  const chatMessages = new Collection({
    name: "chat_messages",
    type: "base",
    fields: [
      { system: false, id: "user", name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "text", name: "text", type: "text", required: true, options: { min: null, max: 500, pattern: "" } },
      { system: false, id: "lat", name: "lat", type: "number", required: true, options: { min: null, max: null } },
      { system: false, id: "lng", name: "lng", type: "number", required: true, options: { min: null, max: null } },
    ],
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: null,
    deleteRule: "@request.auth.role = 'admin'",
  });
  app.dao.saveCollection(chatMessages);

  // =============================================
  // reports
  // =============================================
  const reports = new Collection({
    name: "reports",
    type: "base",
    fields: [
      { system: false, id: "reporter", name: "reporter", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "type", name: "type", type: "select", required: true, options: { maxSelect: 1, values: ["message", "user", "sighting", "comment"] } },
      { system: false, id: "target_id", name: "target_id", type: "text", required: true, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "reason", name: "reason", type: "text", required: true, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "content", name: "content", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "status", name: "status", type: "select", required: false, options: { maxSelect: 1, values: ["pending", "reviewed", "dismissed"] } },
    ],
    listRule: "@request.auth.role = 'admin'",
    viewRule: "@request.auth.role = 'admin'",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.role = 'admin'",
    deleteRule: "@request.auth.role = 'admin'",
  });
  app.dao.saveCollection(reports);

  // =============================================
  // logs
  // =============================================
  const logs = new Collection({
    name: "logs",
    type: "base",
    fields: [
      { system: false, id: "user", name: "user", type: "relation", required: false, options: { collectionId: "_pb_users_auth_", maxSelect: 1, minSelect: null, cascadeDelete: false } },
      { system: false, id: "action", name: "action", type: "text", required: true, options: { min: null, max: null, pattern: "" } },
      { system: false, id: "details", name: "details", type: "text", required: false, options: { min: null, max: null, pattern: "" } },
    ],
    listRule: "@request.auth.role = 'admin'",
    viewRule: "@request.auth.role = 'admin'",
    createRule: "@request.auth.id != ''",
    updateRule: null,
    deleteRule: null,
  });
  app.dao.saveCollection(logs);
}, (app) => {
  // Down: delete all created collections
  const names = ["logs", "reports", "chat_messages", "comments", "sightings"];
  for (const name of names) {
    try {
      const col = app.dao.findCollectionByNameOrId(name);
      app.dao.deleteCollection(col);
    } catch (e) {
      // already gone
    }
  }
});
