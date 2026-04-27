/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const existingFields = users.fields.map(f => f.name);

  if (!existingFields.includes("name")) {
    users.fields.push({ name: "name", type: "text" });
  }
  if (!existingFields.includes("role")) {
    users.fields.push({ name: "role", type: "select", maxSelect: 1, values: ["user", "expert", "admin"] });
  }
  if (!existingFields.includes("points")) {
    users.fields.push({ name: "points", type: "number" });
  }
  if (!existingFields.includes("avatar")) {
    users.fields.push({ name: "avatar", type: "file", maxSelect: 1, maxSize: 2097152 });
  }
  if (!existingFields.includes("last_lat")) {
    users.fields.push({ name: "last_lat", type: "number" });
  }
  if (!existingFields.includes("last_lng")) {
    users.fields.push({ name: "last_lng", type: "number" });
  }
  if (!existingFields.includes("last_seen")) {
    users.fields.push({ name: "last_seen", type: "date" });
  }

  app.save(users);
}, (app) => {
  // no-op rollback
});
