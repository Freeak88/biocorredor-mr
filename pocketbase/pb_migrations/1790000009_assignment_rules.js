/// <reference path="../pb_data/types.d.ts" />

const coordinator = '@request.auth.role = "coordinador" || @request.auth.role = "administrador" || @request.auth.role = "admin"';
const authenticated = '@request.auth.id != ""';

function add(collection, field) {
  if (!collection.fields.find((existing) => existing.name === field.name)) collection.fields.add(field);
}
function text(name, required = false) { return new Field({ name, type: "text", required, hidden: false, presentable: false }); }
function number(name, required = false) { return new Field({ name, type: "number", required, hidden: false, presentable: false }); }
function date(name, required = false) { return new Field({ name, type: "date", required, hidden: false, presentable: false }); }
function relation(name, collectionId, required = false) { return new RelationField({ name, collectionId, required, maxSelect: 1, cascadeDelete: false }); }
function select(name, values, required = false) { return new SelectField({ name, values, required, maxSelect: 1, hidden: false, presentable: false }); }

migrate((app) => {
  const teams = app.findCollectionByNameOrId("teams");
  const devices = app.findCollectionByNameOrId("devices");
  const assignments = app.findCollectionByNameOrId("event_assignments");
  const routes = app.findCollectionByNameOrId("route_points");
  const users = app.findCollectionByNameOrId("users");
  const events = app.findCollectionByNameOrId("survey_events");
  const sites = app.findCollectionByNameOrId("sites");

  add(teams, relation("project", app.findCollectionByNameOrId("projects").id, true)); add(teams, text("code", true)); add(teams, text("name", true)); add(teams, relation("coordinator", users.id)); add(teams, select("status", ["active", "inactive"], true));
  add(devices, text("device_id", true)); add(devices, text("label", true)); add(devices, relation("assigned_to", users.id)); add(devices, select("status", ["available", "assigned", "retired"], true));
  add(assignments, relation("event", events.id, true)); add(assignments, relation("user", users.id, true)); add(assignments, relation("team", teams.id, true)); add(assignments, relation("site", sites.id, true)); add(assignments, relation("device", devices.id)); add(assignments, relation("assigned_by", users.id, true)); add(assignments, select("status", ["assigned", "accepted", "active", "completed", "cancelled"], true)); add(assignments, text("notes"));
  add(routes, relation("event", events.id, true)); add(routes, relation("observer", users.id, true)); add(routes, text("route_point_id", true)); add(routes, number("latitude", true)); add(routes, number("longitude", true)); add(routes, number("accuracy_m")); add(routes, date("recorded_at", true)); add(routes, select("source", ["gps", "manual"], true)); add(routes, number("sequence"));
  app.save(teams); app.save(devices); app.save(assignments); app.save(routes);

  teams.listRule = authenticated; teams.viewRule = authenticated; teams.createRule = coordinator; teams.updateRule = coordinator; teams.deleteRule = coordinator;
  devices.listRule = coordinator; devices.viewRule = coordinator; devices.createRule = coordinator; devices.updateRule = coordinator; devices.deleteRule = coordinator;
  assignments.listRule = `${coordinator} || user.id = @request.auth.id`; assignments.viewRule = `${coordinator} || user.id = @request.auth.id`; assignments.createRule = coordinator; assignments.updateRule = coordinator; assignments.deleteRule = coordinator;
  routes.listRule = coordinator; routes.viewRule = coordinator; routes.createRule = '@request.auth.id != "" && @request.body.observer = @request.auth.id'; routes.updateRule = coordinator; routes.deleteRule = coordinator;

  app.save(teams); app.save(devices); app.save(assignments); app.save(routes);
}, (app) => {});
