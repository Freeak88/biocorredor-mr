/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    name: "first_sightings_log",
    type: "base",
    schema: [
      { name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1 }},
      { name: "sighting", type: "relation", required: true, options: { collectionId: "sightings", maxSelect: 1 }},
      { name: "type", type: "select", required: true, options: { values: ["global", "local"], maxSelect: 1 }},
      { name: "species", type: "text", required: true },
      { name: "radius_km", type: "number", required: false },
    ],
    indexes: [
      "CREATE INDEX idx_first_log_species_type ON first_sightings_log (species, type)",
      "CREATE INDEX idx_first_log_user ON first_sightings_log (user, type)",
    ],
  });
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("first_sightings_log");
  if (collection) {
    app.delete(collection);
  }
});
