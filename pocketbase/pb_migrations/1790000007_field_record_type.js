/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const occurrences = app.findCollectionByNameOrId("occurrences");
  if (!occurrences.fields.find((field) => field.name === "record_type")) {
    occurrences.fields.add(new SelectField({
      name: "record_type",
      values: ["biodiversity", "habitat", "impact"],
      required: false,
      maxSelect: 1,
      hidden: false,
      presentable: false,
    }));
    app.save(occurrences);
  }
}, (app) => {});
