/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // add field
  collection.fields.addAt(16, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Reino",
    "hidden": false,
    "id": "text_gbio01",
    "max": 0,
    "min": 0,
    "name": "kingdom",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Filo/División",
    "hidden": false,
    "id": "text_gbio02",
    "max": 0,
    "min": 0,
    "name": "phylum",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(18, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Clase",
    "hidden": false,
    "id": "text_gbio03",
    "max": 0,
    "min": 0,
    "name": "taxon_class",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(19, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Orden",
    "hidden": false,
    "id": "text_gbio04",
    "max": 0,
    "min": 0,
    "name": "taxon_order",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(20, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Familia",
    "hidden": false,
    "id": "text_gbio05",
    "max": 0,
    "min": 0,
    "name": "family",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(21, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Género",
    "hidden": false,
    "id": "text_gbio06",
    "max": 0,
    "min": 0,
    "name": "genus",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(22, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Especie",
    "hidden": false,
    "id": "text_gbio07",
    "max": 0,
    "min": 0,
    "name": "species",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(23, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Rango taxonómico",
    "hidden": false,
    "id": "text_gbio08",
    "max": 0,
    "min": 0,
    "name": "taxon_rank",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(24, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: País",
    "hidden": false,
    "id": "text_gbio09",
    "max": 0,
    "min": 0,
    "name": "country",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(25, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Estado/Provincia",
    "hidden": false,
    "id": "text_gbio10",
    "max": 0,
    "min": 0,
    "name": "state_province",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(26, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Localidad",
    "hidden": false,
    "id": "text_gbio11",
    "max": 0,
    "min": 0,
    "name": "locality",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(27, new Field({
    "help": "GBIF: Fecha del evento",
    "hidden": false,
    "id": "date_gbio01",
    "max": "",
    "min": "",
    "name": "event_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(28, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Base del registro",
    "hidden": false,
    "id": "text_gbio12",
    "max": 0,
    "min": 0,
    "name": "basis_of_record",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(29, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Estado del registro biológico",
    "hidden": false,
    "id": "text_gbio13",
    "max": 0,
    "min": 0,
    "name": "occurrence_status",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(30, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Conjunto de datos",
    "hidden": false,
    "id": "text_gbio14",
    "max": 0,
    "min": 0,
    "name": "dataset_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(31, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Registrado por",
    "hidden": false,
    "id": "text_gbio15",
    "max": 0,
    "min": 0,
    "name": "recorded_by",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(32, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Identificado por",
    "hidden": false,
    "id": "text_gbio16",
    "max": 0,
    "min": 0,
    "name": "identified_by",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(33, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Número de catálogo",
    "hidden": false,
    "id": "text_gbio17",
    "max": 0,
    "min": 0,
    "name": "catalog_number",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(34, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Código de colección",
    "hidden": false,
    "id": "text_gbio18",
    "max": 0,
    "min": 0,
    "name": "collection_code",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(35, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Código de institución",
    "hidden": false,
    "id": "text_gbio19",
    "max": 0,
    "min": 0,
    "name": "institution_code",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(36, new Field({
    "help": "GBIF: Conteo de individuos",
    "hidden": false,
    "id": "number_gbio01",
    "max": null,
    "min": null,
    "name": "individual_count",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(37, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: ID del registro",
    "hidden": false,
    "id": "text_gbio20",
    "max": 0,
    "min": 0,
    "name": "gbif_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(38, new Field({
    "autogeneratePattern": "",
    "help": "GBIF: Publicador",
    "hidden": false,
    "id": "text_gbio21",
    "max": 0,
    "min": 0,
    "name": "publisher",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // update field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "select2063623452",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "identified",
      "unconfirmed",
      "expert_verified",
      "draft",
      "gbif_import"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3315305632")

  // remove field
  collection.fields.removeById("text_gbio01")

  // remove field
  collection.fields.removeById("text_gbio02")

  // remove field
  collection.fields.removeById("text_gbio03")

  // remove field
  collection.fields.removeById("text_gbio04")

  // remove field
  collection.fields.removeById("text_gbio05")

  // remove field
  collection.fields.removeById("text_gbio06")

  // remove field
  collection.fields.removeById("text_gbio07")

  // remove field
  collection.fields.removeById("text_gbio08")

  // remove field
  collection.fields.removeById("text_gbio09")

  // remove field
  collection.fields.removeById("text_gbio10")

  // remove field
  collection.fields.removeById("text_gbio11")

  // remove field
  collection.fields.removeById("date_gbio01")

  // remove field
  collection.fields.removeById("text_gbio12")

  // remove field
  collection.fields.removeById("text_gbio13")

  // remove field
  collection.fields.removeById("text_gbio14")

  // remove field
  collection.fields.removeById("text_gbio15")

  // remove field
  collection.fields.removeById("text_gbio16")

  // remove field
  collection.fields.removeById("text_gbio17")

  // remove field
  collection.fields.removeById("text_gbio18")

  // remove field
  collection.fields.removeById("text_gbio19")

  // remove field
  collection.fields.removeById("number_gbio01")

  // remove field
  collection.fields.removeById("text_gbio20")

  // remove field
  collection.fields.removeById("text_gbio21")

  // update field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "select2063623452",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "identified",
      "unconfirmed",
      "expert_verified",
      "draft"
    ]
  }))

  return app.save(collection)
})
