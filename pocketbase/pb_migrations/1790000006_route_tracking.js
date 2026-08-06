/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const events = app.findCollectionByNameOrId("survey_events");
  const coordinatorRule = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";

  const routePoints = new Collection({
    type: "base",
    name: "route_points",
    listRule: coordinatorRule,
    viewRule: coordinatorRule,
    createRule: "@request.auth.id != '' && @request.body.observer = @request.auth.id",
    updateRule: coordinatorRule,
    deleteRule: coordinatorRule,
    fields: [
      new RelationField({ name: "event", collectionId: events.id, required: true, maxSelect: 1, cascadeDelete: false }),
      new RelationField({ name: "observer", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: false }),
      new Field({ name: "route_point_id", type: "text", required: true }),
      new Field({ name: "latitude", type: "number", required: true }),
      new Field({ name: "longitude", type: "number", required: true }),
      new Field({ name: "accuracy_m", type: "number", required: false }),
      new Field({ name: "recorded_at", type: "date", required: true }),
      new SelectField({ name: "source", values: ["gps", "manual"], required: true, maxSelect: 1 }),
      new Field({ name: "sequence", type: "number", required: false }),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_route_points_id ON {{route_points}} (route_point_id)",
      "CREATE INDEX idx_route_points_event_observer ON {{route_points}} (event, observer, recorded_at)",
    ],
  });
  app.save(routePoints);
}, (app) => {});
