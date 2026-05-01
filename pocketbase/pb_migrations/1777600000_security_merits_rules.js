/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const userFields = users.fields.map((f) => f.name);
  if (!userFields.includes("merits")) {
    users.fields.push({
      name: "merits",
      type: "select",
      maxSelect: 20,
      values: ["Geofirmador Oficial", "Cartografo", "Micologo", "Curador"],
    });
  }
  app.save(users);

  const sightings = app.findCollectionByNameOrId("sightings");
  const toxicity = sightings.fields.find((f) => f.name === "toxicity");
  if (toxicity && toxicity.values && !toxicity.values.includes("Toxico")) {
    toxicity.values.push("Toxico");
  }
  if (toxicity && toxicity.values && !toxicity.values.includes("Tóxico")) {
    toxicity.values.push("Tóxico");
  }
  sightings.listRule = "";
  sightings.viewRule = "";
  sightings.createRule = "@request.auth.id != '' && user = @request.auth.id";
  sightings.updateRule = "@request.auth.id = user.id || @request.auth.role = 'admin'";
  sightings.deleteRule = "@request.auth.id = user.id || @request.auth.role = 'admin'";
  app.save(sightings);

  const comments = app.findCollectionByNameOrId("comments");
  comments.listRule = "";
  comments.viewRule = "";
  comments.createRule = "@request.auth.id != '' && user = @request.auth.id";
  comments.updateRule = "@request.auth.id = user.id || @request.auth.role = 'admin'";
  comments.deleteRule = "@request.auth.id = user.id || @request.auth.role = 'admin'";
  app.save(comments);

  const chatMessages = app.findCollectionByNameOrId("chat_messages");
  chatMessages.listRule = "@request.auth.id != ''";
  chatMessages.viewRule = "@request.auth.id != ''";
  chatMessages.createRule = "@request.auth.id != '' && user = @request.auth.id";
  chatMessages.updateRule = null;
  chatMessages.deleteRule = "@request.auth.role = 'admin'";
  app.save(chatMessages);

  const reports = app.findCollectionByNameOrId("reports");
  reports.listRule = "@request.auth.role = 'admin'";
  reports.viewRule = "@request.auth.role = 'admin'";
  reports.createRule = "@request.auth.id != '' && reporter = @request.auth.id";
  reports.updateRule = "@request.auth.role = 'admin'";
  reports.deleteRule = "@request.auth.role = 'admin'";
  app.save(reports);

  const logs = app.findCollectionByNameOrId("logs");
  logs.listRule = "@request.auth.role = 'admin'";
  logs.viewRule = "@request.auth.role = 'admin'";
  logs.createRule = "@request.auth.id != ''";
  logs.updateRule = null;
  logs.deleteRule = null;
  app.save(logs);
}, (app) => {
  const sightings = app.findCollectionByNameOrId("sightings");
  sightings.listRule = "";
  sightings.viewRule = "";
  sightings.createRule = "@request.auth.id != ''";
  sightings.updateRule = "@request.auth.id != ''";
  sightings.deleteRule = "@request.auth.id != ''";
  app.save(sightings);

  const comments = app.findCollectionByNameOrId("comments");
  comments.listRule = "";
  comments.viewRule = "";
  comments.createRule = "@request.auth.id != ''";
  comments.updateRule = "@request.auth.id != ''";
  comments.deleteRule = "@request.auth.id != ''";
  app.save(comments);

  const chatMessages = app.findCollectionByNameOrId("chat_messages");
  chatMessages.listRule = "@request.auth.id != ''";
  chatMessages.viewRule = "@request.auth.id != ''";
  chatMessages.createRule = "@request.auth.id != ''";
  app.save(chatMessages);

  const reports = app.findCollectionByNameOrId("reports");
  reports.listRule = null;
  reports.viewRule = null;
  reports.createRule = "@request.auth.id != ''";
  reports.updateRule = null;
  reports.deleteRule = null;
  app.save(reports);

  const logs = app.findCollectionByNameOrId("logs");
  logs.listRule = null;
  logs.viewRule = null;
  logs.createRule = "@request.auth.id != ''";
  logs.updateRule = null;
  logs.deleteRule = null;
  app.save(logs);
});
