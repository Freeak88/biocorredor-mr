/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const existingFields = users.fields.map(f => f.name);

  if (!existingFields.includes("name")) {
    users.fields.add(new TextField({
      name: "name",
      required: false
    }));
  }
  if (!existingFields.includes("role")) {
    users.fields.add(new SelectField({
      name: "role",
      required: false,
      maxSelect: 1,
      values: ["user", "expert", "admin"]
    }));
  }
  if (!existingFields.includes("points")) {
    users.fields.add(new NumberField({
      name: "points",
      required: false
    }));
  }
  if (!existingFields.includes("avatar")) {
    users.fields.add(new FileField({
      name: "avatar",
      required: false,
      maxSelect: 1,
      maxSize: 2097152
    }));
  }
  if (!existingFields.includes("last_lat")) {
    users.fields.add(new NumberField({
      name: "last_lat",
      required: false
    }));
  }
  if (!existingFields.includes("last_lng")) {
    users.fields.add(new NumberField({
      name: "last_lng",
      required: false
    }));
  }
  if (!existingFields.includes("last_seen")) {
    users.fields.add(new DateField({
      name: "last_seen",
      required: false
    }));
  }

  app.save(users);
}, (app) => {
  // no-op rollback
});
