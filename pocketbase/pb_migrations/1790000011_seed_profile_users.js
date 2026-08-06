/// <reference path="../pb_data/types.d.ts" />

function createRecord(app, collection, data) {
  const record = new Record(collection);
  Object.keys(data).forEach((key) => record.set(key, data[key]));
  app.save(record);
  return record;
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const projects = app.findCollectionByNameOrId("projects");
  const events = app.findCollectionByNameOrId("survey_events");
  const sites = app.findCollectionByNameOrId("sites");
  const occurrences = app.findCollectionByNameOrId("occurrences");
  const identifications = app.findCollectionByNameOrId("identifications");
  const changes = app.findCollectionByNameOrId("territorial_changes");
  const audit = app.findCollectionByNameOrId("audit_log");
  const teams = app.findCollectionByNameOrId("teams");
  const devices = app.findCollectionByNameOrId("devices");
  const assignments = app.findCollectionByNameOrId("event_assignments");
  const routes = app.findCollectionByNameOrId("route_points");

  const role = users.fields.find((field) => field.name === "role");
  if (role && role.values && !role.values.includes("curador")) role.values.push("curador");
  app.save(users);

  const coordinatorRule = '@request.auth.role = "coordinador" || @request.auth.role = "curador" || @request.auth.role = "administrador" || @request.auth.role = "admin"';
  [identifications, audit].forEach((collection) => { collection.listRule = coordinatorRule; collection.viewRule = coordinatorRule; });
  identifications.createRule = coordinatorRule; identifications.updateRule = coordinatorRule;
  audit.createRule = '@request.auth.id != ""';
  [teams, devices, assignments, routes].forEach((collection) => {
    collection.listRule = coordinatorRule; collection.viewRule = coordinatorRule;
    collection.createRule = coordinatorRule; collection.updateRule = coordinatorRule; collection.deleteRule = coordinatorRule;
  });
  routes.createRule = '@request.auth.id != "" && @request.body.observer = @request.auth.id';
  app.save(identifications); app.save(audit); app.save(teams); app.save(devices); app.save(assignments); app.save(routes);

  let curator = app.findAllRecords(users).find((record) => record.get("email") === "curador@biocorredor.local");
  if (!curator) {
    curator = new Record(users);
    curator.setEmail("curador@biocorredor.local"); curator.setPassword("BiocorredorDemo2026!"); curator.set("name", "Curaduria Demo"); curator.set("role", "curador"); curator.set("verified", true); app.save(curator);
  }

  const coordinator = app.findAllRecords(users).find((record) => record.get("email") === "coord@biocorredor.local");
  const administrator = app.findAllRecords(users).find((record) => record.get("email") === "admin@biocorredor.local");
  const project = app.findAllRecords(projects).find((record) => record.get("code") === "BIOCORREDOR-MR");
  const event = app.findAllRecords(events).find((record) => record.get("event_id") === "BIO-MR-PILOTO-2026-08-11");
  const site = app.findAllRecords(sites).find((record) => record.get("code") === "SEC-CENTRO");
  const team = app.findAllRecords(teams).find((record) => record.get("code") === "EQ-01");
  if (!project || !event || !site || !coordinator || !administrator) return;

  const curatorOccurrence = app.findAllRecords(occurrences).find((record) => record.get("occurrence_id") === "OBS-CURADURIA-001") || createRecord(app, occurrences, {
    occurrence_id: "OBS-CURADURIA-001", event: event.id, observer: curator.id, observed_at: "2026-08-11 12:10:00.000Z",
    latitude: -34.8294, longitude: -58.3768, coordinate_uncertainty_m: 8, location_source: "gps", field_name: "Biocorredor MR",
    scientific_name: "Morfoespecie pendiente", taxon_group: "fungi", quantity: 2, quantity_unit: "ejemplares", substrate: "tronco caido",
    microhabitat: "sombra humeda", occurrence_status: "detected", identification_status: "pending_review", sensitive_record: "false",
    public_visibility: "team", notes: "Registro preparado para revisión taxonómica.", local_status: "synced",
  });
  if (curatorOccurrence && !app.findAllRecords(identifications).some((record) => record.get("occurrence") === curatorOccurrence.id)) {
    createRecord(app, identifications, {
      occurrence: curatorOccurrence.id, scientific_name: "Ganoderma sp.", vernacular_name: "Yesquero", taxon_rank: "genus",
      identified_by: curator.id, identified_at: "2026-08-11 17:00:00.000Z", confidence: 0.72,
      diagnostic_features: "Superficie pileica y sustrato observados en la fotografía original.", status: "suggested",
      notes: "Confirmar con revisión de himenio y contexto del ambiente.",
    });
  }

  if (coordinator && !app.findAllRecords(changes).some((record) => record.get("change_type") === "watercourse_change" && record.get("observer") === coordinator.id)) {
    createRecord(app, changes, {
      event: event.id, observer: coordinator.id, change_type: "watercourse_change", observed_at: "2026-08-11 13:20:00.000Z",
      latitude: -34.8301, longitude: -58.3755, coordinate_uncertainty_m: 12, estimated_area_m2: 40,
      objective_description: "Modificación visible en el borde del escurrimiento; requiere verificación documental.", initial_severity: "medium",
      status: "pending_review", public_visibility: "team", notes: "Dato demo para el control territorial.",
    });
  }

  if (administrator && !app.findAllRecords(audit).some((record) => record.get("action") === "seed_profile_demo")) {
    createRecord(app, audit, {
      actor: administrator.id, action: "seed_profile_demo", collection_name: "users", record_id: curator.id,
      timestamp: "2026-08-11 09:00:00.000Z", reason: "Cuenta demo de curaduría y datos de prueba.", metadata_json: { profile: "curador", seed: true },
    });
  }

  if (team) {
    ["obs1@biocorredor.local", "obs2@biocorredor.local", "obs3@biocorredor.local"].forEach((email, index) => {
      const observer = app.findAllRecords(users).find((record) => record.get("email") === email);
      const device = app.findAllRecords(devices).find((record) => record.get("device_id") === `PILOT-${index + 1}`);
      if (!observer || !device || app.findAllRecords(routes).some((record) => record.get("observer") === observer.id)) return;
      [[-34.829 + index * 0.0004, -58.377 + index * 0.0003], [-34.8294 + index * 0.0004, -58.3765 + index * 0.0003]].forEach(([latitude, longitude], pointIndex) => createRecord(app, routes, {
        event: event.id, observer: observer.id, route_point_id: `DEMO-ROUTE-${index + 1}-${pointIndex + 1}`, latitude, longitude, accuracy_m: 9,
        recorded_at: `2026-08-11 1${1 + index}:0${pointIndex}:00.000Z`, source: "gps", sequence: pointIndex,
      }));
    });
  }
}, (app) => {});
