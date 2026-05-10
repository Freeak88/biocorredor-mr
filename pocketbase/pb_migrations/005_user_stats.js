/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const existingFields = users.fields.map((f) => f.name);

  if (!existingFields.includes("sightings_total")) {
    users.fields.add(new NumberField({ name: "sightings_total", required: false, default: 0 }));
  }
  if (!existingFields.includes("sightings_first_global")) {
    users.fields.add(new NumberField({ name: "sightings_first_global", required: false, default: 0 }));
  }
  if (!existingFields.includes("sightings_first_local")) {
    users.fields.add(new NumberField({ name: "sightings_first_local", required: false, default: 0 }));
  }
  if (!existingFields.includes("sightings_streak_current")) {
    users.fields.add(new NumberField({ name: "sightings_streak_current", required: false, default: 0 }));
  }
  if (!existingFields.includes("sightings_streak_max")) {
    users.fields.add(new NumberField({ name: "sightings_streak_max", required: false, default: 0 }));
  }
  if (!existingFields.includes("last_sighting_at")) {
    users.fields.add(new DateField({ name: "last_sighting_at", required: false }));
  }
  if (!existingFields.includes("badges")) {
    users.fields.add(new JSONField({ name: "badges", required: false, default: "[]" }));
  }

  app.save(users);
}, (app) => {
  // no-op rollback
});
