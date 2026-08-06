/// <reference path="../pb_data/types.d.ts" />

function secure(collection, rules, indexes) {
  collection.listRule = rules.list;
  collection.viewRule = rules.view;
  collection.createRule = rules.create;
  collection.updateRule = rules.update;
  collection.deleteRule = rules.delete;
  if (indexes) collection.indexes = indexes;
}

migrate((app) => {
  const authed = "@request.auth.id != ''";
  const coordinators = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";
  const layers = app.findCollectionByNameOrId("territorial_layers");
  const parcels = app.findCollectionByNameOrId("parcels");
  const documents = app.findCollectionByNameOrId("parcel_documents");
  const alerts = app.findCollectionByNameOrId("territorial_alerts");

  secure(layers, { list: authed, view: authed, create: coordinators, update: coordinators, delete: coordinators }, [
    "CREATE UNIQUE INDEX idx_territorial_layers_code ON {{territorial_layers}} (code)",
  ]);
  secure(parcels, { list: authed, view: authed, create: coordinators, update: coordinators, delete: coordinators }, [
    "CREATE UNIQUE INDEX idx_parcels_project_code ON {{parcels}} (project, parcel_code)",
  ]);
  secure(documents, { list: authed, view: authed, create: coordinators, update: coordinators, delete: coordinators }, [
    "CREATE INDEX idx_parcel_documents_parcel ON {{parcel_documents}} (parcel)",
  ]);
  secure(alerts, { list: authed, view: authed, create: authed, update: coordinators, delete: coordinators }, [
    "CREATE INDEX idx_territorial_alerts_parcel ON {{territorial_alerts}} (parcel)",
    "CREATE INDEX idx_territorial_alerts_status ON {{territorial_alerts}} (status)",
  ]);

  app.save(layers);
  app.save(parcels);
  app.save(documents);
  app.save(alerts);
}, (app) => {});
