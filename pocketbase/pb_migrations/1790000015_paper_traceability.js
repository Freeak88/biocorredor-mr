/// <reference path="../pb_data/types.d.ts" />

function add(collection, field) {
  if (!collection.fields.find((existing) => existing.name === field.name)) collection.fields.add(field);
}

function paperFields() {
  return [
    new Field({ name: "paper_id", type: "text" }),
    new Field({ name: "paper_source", type: "bool" }),
    new Field({ name: "paper_image_media_id", type: "text" }),
    new Field({ name: "paper_transcribed_by", type: "text" }),
    new Field({ name: "paper_transcribed_at", type: "date" }),
    new Field({ name: "paper_verified_by", type: "text" }),
    new Field({ name: "paper_verified_at", type: "date" }),
  ];
}

migrate((app) => {
  ["occurrences", "territorial_changes"].forEach((name) => {
    const collection = app.findCollectionByNameOrId(name);
    paperFields().forEach((field) => add(collection, field));
    app.save(collection);
  });

  const media = app.findCollectionByNameOrId("media_evidence");
  add(media, new Field({ name: "paper_id", type: "text" }));
  add(media, new Field({ name: "media_role", type: "text" }));
  app.save(media);
}, (app) => {
  // Additive migration: paper traceability data is retained on rollback.
});
