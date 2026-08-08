/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {

  // Add "gbif_import" to sightings.status values
  const sightings = app.findCollectionByNameOrId("sightings");
  const statusField = sightings.fields.find(f => f.name === "status");
  if (statusField && !statusField.values.includes("gbif_import")) {
    statusField.values.push("gbif_import");
    app.save(sightings);
  }

  // Create bot user only if not exists
  try {
    app.findAuthRecordByEmail("users", "gbif@biocorredor-mr.local");
    console.log("GBIF bot already exists, skipping creation.");
  } catch (e) {
    const bot = new Record(app.findCollectionByNameOrId("users"));
    bot.setEmail("gbif@biocorredor-mr.local");
    bot.setPassword("Gb1f_B0t_2024!xK9$mZ");
    bot.set("name", "GBIF Import Bot");
    bot.set("verified", true);
    app.save(bot);
    console.log("GBIF bot created:", bot.id);
  }

}, (app) => {
  // Remove bot user
  try {
    const bot = app.findAuthRecordByEmail("users", "gbif@biocorredor-mr.local");
    app.delete(bot);
  } catch (e) {}

  // Remove "gbif_import" from status values
  try {
    const sightings = app.findCollectionByNameOrId("sightings");
    const statusField = sightings.fields.find(f => f.name === "status");
    if (statusField) {
      statusField.values = statusField.values.filter(v => v !== "gbif_import");
      app.save(sightings);
    }
  } catch (e) {}
});
