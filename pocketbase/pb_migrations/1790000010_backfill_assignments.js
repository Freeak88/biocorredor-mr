/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const projects = app.findCollectionByNameOrId("projects");
  const events = app.findCollectionByNameOrId("survey_events");
  const sites = app.findCollectionByNameOrId("sites");
  const teams = app.findCollectionByNameOrId("teams");
  const devices = app.findCollectionByNameOrId("devices");
  const assignments = app.findCollectionByNameOrId("event_assignments");
  const allUsers = app.findAllRecords(users);
  const pilotEvent = app.findAllRecords(events).find((record) => record.get("event_id") === "BIO-MR-PILOTO-2026-08-11");
  const project = app.findAllRecords(projects).find((record) => record.get("code") === "BIOCORREDOR-MR");
  const site = app.findAllRecords(sites).find((record) => record.get("code") === "SEC-CENTRO");
  const coordinator = allUsers.find((record) => record.get("email") === "coord@biocorredor.local");
  if (!pilotEvent || !project || !site || !coordinator) return;

  let team = app.findAllRecords(teams).find((record) => record.get("code") === "EQ-01");
  if (!team) team = app.findAllRecords(teams)[0];
  if (!team) return;
  team.set("project", project.id); team.set("code", "EQ-01"); team.set("name", "Equipo Piloto"); team.set("coordinator", coordinator.id); team.set("status", "active"); app.save(team);

  ["obs1@biocorredor.local", "obs2@biocorredor.local", "obs3@biocorredor.local"].forEach((email, index) => {
    const user = allUsers.find((record) => record.get("email") === email);
    if (!user) return;
    let device = app.findAllRecords(devices).find((record) => record.get("device_id") === `PILOT-${index + 1}`);
    if (!device) device = app.findAllRecords(devices)[index];
    if (!device) return;
    device.set("device_id", `PILOT-${index + 1}`); device.set("label", `Teléfono piloto ${index + 1}`); device.set("assigned_to", user.id); device.set("status", "assigned"); app.save(device);
    let assignment = app.findAllRecords(assignments).find((record) => record.get("user") === user.id && record.get("event") === pilotEvent.id);
    if (!assignment) assignment = app.findAllRecords(assignments)[index];
    if (!assignment) assignment = new Record(assignments);
    assignment.set("event", pilotEvent.id); assignment.set("user", user.id); assignment.set("team", team.id); assignment.set("site", site.id); assignment.set("device", device.id); assignment.set("assigned_by", coordinator.id); assignment.set("status", "assigned"); app.save(assignment);
  });
}, (app) => {});
