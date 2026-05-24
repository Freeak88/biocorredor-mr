/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Count sightings per user (excluding GBIF imports)
  const sightings = app.findRecordsByFilter("sightings", `status != 'gbif_import'`);
  const userCounts = {};
  
  for (const s of sightings) {
    const uid = s.getString("user");
    if (!uid) continue;
    userCounts[uid] = (userCounts[uid] || 0) + 1;
  }
  
  // Update each user
  for (const [uid, count] of Object.entries(userCounts)) {
    try {
      const user = app.findRecordById("users", uid);
      if (user) {
        user.set("sightings_total", count);
        app.save(user);
      }
    } catch (err) {
      console.error("backfill user", uid, err);
    }
  }
}, (app) => {
  // no-op rollback
});
