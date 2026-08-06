/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const assignments = app.findCollectionByNameOrId("event_assignments");
  const coordinator = '@request.auth.role = "coordinador" || @request.auth.role = "curador" || @request.auth.role = "administrador" || @request.auth.role = "admin"';
  assignments.listRule = `${coordinator} || user.id = @request.auth.id`;
  assignments.viewRule = `${coordinator} || user.id = @request.auth.id`;
  app.save(assignments);
}, (app) => {});
