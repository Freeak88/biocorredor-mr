/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {

  // =============================================
  // sightings
  // =============================================
  let sightings = new Collection({
    type: "base",
    name: "sightings",
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "mushroom_name", type: "text", required: true },
      { name: "description", type: "text", required: true },
      { name: "toxicity", type: "select", required: false, maxSelect: 1, values: ["Comestible", "Tóxico", "Mortal", "Desconocido"] },
      { name: "habitat", type: "text", required: false },
      { name: "features", type: "text", required: false },
      { name: "lat", type: "number", required: true },
      { name: "lng", type: "number", required: true },
      { name: "geohash", type: "text", required: false },
      { name: "images", type: "file", required: false, maxSelect: 10, maxSize: 5242880 },
      { name: "status", type: "select", required: false, maxSelect: 1, values: ["identified", "unconfirmed", "expert_verified", "draft"] },
      { name: "network_id", type: "text", required: false },
      { name: "geofirmed_by", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "geofirmed_at", type: "date", required: false },
      { name: "ai_analysis", type: "json", required: false },
    ],
    indexes: [
      "CREATE INDEX idx_sightings_geohash ON {{sightings}} (geohash)",
      "CREATE INDEX idx_sightings_status ON {{sightings}} (status)",
    ],
  });
  app.save(sightings);

  sightings = app.findCollectionByNameOrId("sightings");

  // =============================================
  // comments
  // =============================================
  let comments = new Collection({
    type: "base",
    name: "comments",
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      { name: "sighting", type: "relation", required: true, collectionId: sightings.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "text", type: "text", required: true },
    ],
  });
  app.save(comments);

  // =============================================
  // chat_messages
  // =============================================
  let chatMessages = new Collection({
    type: "base",
    name: "chat_messages",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "text", type: "text", required: true },
      { name: "lat", type: "number", required: true },
      { name: "lng", type: "number", required: true },
    ],
  });
  app.save(chatMessages);

  // =============================================
  // reports
  // =============================================
  let reports = new Collection({
    type: "base",
    name: "reports",
    createRule: "@request.auth.id != ''",
    fields: [
      { name: "reporter", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["message", "user", "sighting", "comment"] },
      { name: "target_id", type: "text", required: true },
      { name: "reason", type: "text", required: true },
      { name: "content", type: "text", required: false },
      { name: "status", type: "select", required: false, maxSelect: 1, values: ["pending", "reviewed", "dismissed"] },
    ],
  });
  app.save(reports);

  // =============================================
  // logs
  // =============================================
  let logs = new Collection({
    type: "base",
    name: "logs",
    createRule: "@request.auth.id != ''",
    fields: [
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "action", type: "text", required: true },
      { name: "details", type: "text", required: false },
    ],
  });
  app.save(logs);

  // =============================================
  // rate_limits
  // =============================================
  let rateLimits = new Collection({
    type: "base",
    name: "rate_limits",
    createRule: "@request.auth.id != ''",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "action", type: "text", required: true },
    ],
  });
  app.save(rateLimits);

}, (app) => {
  const names = ["rate_limits", "logs", "reports", "chat_messages", "comments", "sightings"];
  for (const name of names) {
    try {
      const col = app.findCollectionByNameOrId(name);
      app.delete(col);
    } catch (e) {}
  }
});
