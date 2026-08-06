/// <reference path="../pb_data/types.d.ts" />

function optional(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch { return null; }
}

function text(name, required = false) { return new Field({ name, type: "text", required, hidden: false, presentable: false }); }
function relation(name, collectionId, required = false) { return new RelationField({ name, collectionId, required, maxSelect: 1, cascadeDelete: false }); }
function select(name, values, required = false) { return new SelectField({ name, values, required, maxSelect: 1, hidden: false, presentable: false }); }

const coordinatorRule = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";
const authenticatedRule = "@request.auth.id != ''";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const projects = app.findCollectionByNameOrId("projects");
  const events = app.findCollectionByNameOrId("survey_events");
  const sites = app.findCollectionByNameOrId("sites");

  let teams = optional(app, "teams");
  if (!teams) {
    teams = new Collection({
      type: "base", name: "teams", listRule: authenticatedRule, viewRule: authenticatedRule,
      createRule: coordinatorRule, updateRule: coordinatorRule, deleteRule: coordinatorRule,
      fields: [relation("project", projects.id, true), text("code", true), text("name", true), relation("coordinator", users.id), select("status", ["active", "inactive"], true)],
      indexes: ["CREATE UNIQUE INDEX idx_teams_project_code ON {{teams}} (project, code)"],
    });
    app.save(teams);
  }

  let devices = optional(app, "devices");
  if (!devices) {
    devices = new Collection({
      type: "base", name: "devices", listRule: coordinatorRule, viewRule: coordinatorRule,
      createRule: coordinatorRule, updateRule: coordinatorRule, deleteRule: coordinatorRule,
      fields: [text("device_id", true), text("label", true), relation("assigned_to", users.id), select("status", ["available", "assigned", "retired"], true)],
      indexes: ["CREATE UNIQUE INDEX idx_devices_device_id ON {{devices}} (device_id)"],
    });
    app.save(devices);
  }

  let assignments = optional(app, "event_assignments");
  if (!assignments) {
    assignments = new Collection({
      type: "base", name: "event_assignments",
      listRule: `${coordinatorRule} || user = @request.auth.id`,
      viewRule: `${coordinatorRule} || user = @request.auth.id`,
      createRule: coordinatorRule, updateRule: coordinatorRule, deleteRule: coordinatorRule,
      fields: [
        relation("event", events.id, true), relation("user", users.id, true), relation("team", teams.id, true),
        relation("site", sites.id, true), relation("device", devices.id), relation("assigned_by", users.id, true),
        select("status", ["assigned", "accepted", "active", "completed", "cancelled"], true),
        text("notes"),
      ],
      indexes: ["CREATE UNIQUE INDEX idx_event_assignments_event_user ON {{event_assignments}} (event, user)"],
    });
    app.save(assignments);
  }

  // Development seed: keeps the existing local pilot usable, while production
  // can create the same records through the coordinator workflow.
  const pilotEvent = app.findAllRecords(events).find((record) => record.get("event_id") === "BIO-MR-PILOTO-2026-08-11");
  const project = app.findAllRecords(projects).find((record) => record.get("code") === "BIOCORREDOR-MR");
  const site = app.findAllRecords(sites).find((record) => record.get("code") === "SEC-CENTRO");
  const coordinator = app.findAllRecords(users).find((record) => record.get("email") === "coord@biocorredor.local");
  if (!pilotEvent || !project || !site || !coordinator) return;

  let team = app.findAllRecords(teams).find((record) => record.get("code") === "EQ-01");
  if (!team) {
    team = new Record(teams);
    team.set("project", project.id); team.set("code", "EQ-01"); team.set("name", "Equipo Piloto");
    team.set("coordinator", coordinator.id); team.set("status", "active"); app.save(team);
  }

  ["obs1@biocorredor.local", "obs2@biocorredor.local", "obs3@biocorredor.local"].forEach((email, index) => {
    const user = app.findAllRecords(users).find((record) => record.get("email") === email);
    if (!user || app.findAllRecords(assignments).some((record) => record.get("event") === pilotEvent.id && record.get("user") === user.id)) return;
    const device = new Record(devices);
    device.set("device_id", `PILOT-${index + 1}`); device.set("label", `Teléfono piloto ${index + 1}`); device.set("assigned_to", user.id); device.set("status", "assigned"); app.save(device);
    const assignment = new Record(assignments);
    assignment.set("event", pilotEvent.id); assignment.set("user", user.id); assignment.set("team", team.id); assignment.set("site", site.id); assignment.set("device", device.id); assignment.set("assigned_by", coordinator.id); assignment.set("status", "assigned"); app.save(assignment);
  });
}, (app) => {});
