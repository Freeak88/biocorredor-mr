/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sightings")

  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "bool_public",
    "name": "public",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sightings")
  collection.fields.removeById("bool_public")
  return app.save(collection)
})
