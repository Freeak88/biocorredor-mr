/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // add field
  collection.fields.addAt(39, new Field({
    "exceptDomains": null,
    "help": "",
    "hidden": false,
    "id": "gbif_image_url",
    "name": "gbif_image_url",
    "onlyDomains": null,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "url"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // remove field
  collection.fields.removeById("gbif_image_url")

  return app.save(collection)
})
