/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632");
  const imagesField = collection.fields.find(f => f.name === "images");
  if (imagesField) {
    imagesField.maxSize = 15728640; // 15MB
  }
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632");
  const imagesField = collection.fields.find(f => f.name === "images");
  if (imagesField) {
    imagesField.maxSize = 5242880; // back to 5MB
  }
  return app.save(collection);
});
