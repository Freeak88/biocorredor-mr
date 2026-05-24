/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Backfill: all existing sightings should be public by default
  const collection = app.findCollectionByNameOrId("sightings")
  const records = app.findAllRecords(collection)
  
  for (const record of records) {
    record.set("public", true)
    app.save(record)
  }
  
  return null
}, (app) => {
  // Reverse: set all back to false (not ideal but migration-safe)
  const collection = app.findCollectionByNameOrId("sightings")
  const records = app.findAllRecords(collection)
  
  for (const record of records) {
    record.set("public", false)
    app.save(record)
  }
  
  return null
})
