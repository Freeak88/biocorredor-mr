/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // add field
  collection.fields.addAt(40, new Field({
    "help": "",
    "hidden": false,
    "id": "weather_context",
    "maxSize": 0,
    "name": "weather_context",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(41, new Field({
    "help": "",
    "hidden": false,
    "id": "elevation",
    "max": null,
    "min": null,
    "name": "elevation",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(42, new Field({
    "help": "",
    "hidden": false,
    "id": "photoperiod",
    "maxSize": 0,
    "name": "photoperiod",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // remove field
  collection.fields.removeById("weather_context")

  // remove field
  collection.fields.removeById("elevation")

  // remove field
  collection.fields.removeById("photoperiod")

  return app.save(collection)
})
