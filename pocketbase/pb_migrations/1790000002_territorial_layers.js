/// <reference path="../pb_data/types.d.ts" />

function field(name, type, required = false) {
  return new Field({ name, type, required, hidden: false, presentable: false });
}

function selectField(name, values, required = false) {
  return new SelectField({ name, values, required, maxSelect: 1, hidden: false, presentable: false });
}

function relation(name, collectionId, required = false) {
  return new RelationField({ name, collectionId, required, maxSelect: 1, cascadeDelete: false });
}

function add(collection, item) {
  if (!collection.fields.find((existing) => existing.name === item.name)) collection.fields.add(item);
}

function optional(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch { return null; }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const projects = app.findCollectionByNameOrId("projects");
  const occurrences = app.findCollectionByNameOrId("occurrences");
  const coordinators = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";
  const authed = "@request.auth.id != ''";

  const layers = new Collection({
    type: "base", name: "territorial_layers", listRule: authed, viewRule: authed,
    createRule: coordinators, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      field("code", "text", true), field("title", "text", true),
      selectField("category", ["parcelas", "zonificacion", "normativa", "hidrologia", "biodiversidad", "transformaciones"], true), field("source_organization", "text"),
      field("source_url", "url"), selectField("service_type", ["WMS", "WFS", "WMS/WFS", "GeoJSON", "document", "internal"]), field("service_url", "url"),
      field("attribution", "text"), field("source_version", "text"), field("last_verified_at", "date"),
      field("offline_capable", "bool"), field("style_json", "json"), selectField("status", ["reference", "active", "disabled"]),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_territorial_layers_code ON {{territorial_layers}} (code)"],
  });
  app.save(layers);

  const parcels = new Collection({
    type: "base", name: "parcels", listRule: authed, viewRule: authed,
    createRule: coordinators, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      relation("project", projects.id, true), field("parcel_code", "text", true), field("cadastral_nomenclature", "text"),
      field("partida", "text"), field("surface_m2", "number"), selectField("ownership_status", ["public", "private", "mixed", "no_documentado"]),
      field("ownership_source", "text"), field("zoning_code", "text"), field("ordinance_category", "text"),
      field("geometry_geojson", "json"), field("public_geometry_geojson", "json"), field("environmental_value_json", "json"),
      field("source_layer", "text"), field("source_record_id", "text"), field("last_verified_at", "date"), selectField("status", ["active", "historic", "needs_review"]),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_parcels_project_code ON {{parcels}} (project, parcel_code)"],
  });
  app.save(parcels);

  const documents = new Collection({
    type: "base", name: "parcel_documents", listRule: authed, viewRule: authed,
    createRule: coordinators, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      relation("parcel", parcels.id, true), selectField("document_type", ["expediente", "ordenanza", "permiso", "DIA", "factibilidad_hidraulica", "localizacion", "convalidacion", "pedido_informacion"], true), field("title", "text", true),
      field("expediente_number", "text"), field("issuing_organization", "text"), selectField("status", ["pendiente", "presentado", "aprobado", "rechazado", "no_documentado"]),
      field("document_url", "url"), field("document_date", "date"), field("document_sha256", "text"), field("notes", "editor"),
    ],
    indexes: ["CREATE INDEX idx_parcel_documents_parcel ON {{parcel_documents}} (parcel)"],
  });
  app.save(documents);

  const alerts = new Collection({
    type: "base", name: "territorial_alerts", listRule: authed, viewRule: authed,
    createRule: authed, updateRule: coordinators, deleteRule: coordinators,
    fields: [
      relation("parcel", parcels.id, false), relation("occurrence", occurrences.id, false), field("rule_code", "text", true),
      selectField("alert_type", ["documentation_pending", "preservation_risk", "hydraulic_review", "protected_forest", "preliminary_urbanization", "missing_DIA", "baseline_change"], true), selectField("severity", ["low", "medium", "high"], true), field("evidence_json", "json"),
      selectField("status", ["open", "under_review", "verified", "dismissed"], true), relation("created_by", users.id, true), relation("reviewed_by", users.id, false),
      field("review_notes", "editor"), field("created_at", "date", true), field("reviewed_at", "date"),
    ],
    indexes: ["CREATE INDEX idx_territorial_alerts_parcel ON {{territorial_alerts}} (parcel)", "CREATE INDEX idx_territorial_alerts_status ON {{territorial_alerts}} (status)"],
  });
  app.save(alerts);

  add(occurrences, relation("parcel", parcels.id, false));
  add(occurrences, field("territorial_context_json", "json"));
  add(occurrences, selectField("territorial_context_status", ["pending", "matched", "indeterminate", "reviewed"]));
  app.save(occurrences);

  const seed = [
    ["CADASTRO-PARCELAS", "Parcelas catastrales", "parcelas", "ARBA / IDEBA", "https://ideba.gba.gob.ar/es/visualizador/arba", "WFS/WMS", "reference"],
    ["ZONIFICACION-URBASIG", "Zonificacion vigente", "zonificacion", "urBAsig", "https://urbasig.mgob.gba.gob.ar/urbasig/", "WMS/WFS", "reference"],
    ["ORD-11819-20", "Ordenanza 11.819/20 y anexos", "normativa", "Municipio / Provincia", "https://boletinoficial.gba.gob.ar/secciones/11321/ver", "document", "reference"],
    ["HIDRO-FORESTACION", "Cursos de agua, inundabilidad y forestacion", "hidrologia", "IDEBA", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["BIODIVERSIDAD-AMBIENTES", "Biodiversidad y ambientes", "biodiversidad", "IDEBA / fuentes validadas", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["OBRAS-EXPEDIENTES", "Obras, cambios territoriales y expedientes", "transformaciones", "Biocorredor MR", "", "internal", "active"],
  ];
  seed.forEach(([code, title, category, organization, url, serviceType, status]) => {
    const record = new Record(layers);
    record.set("code", code); record.set("title", title); record.set("category", category);
    record.set("source_organization", organization); record.set("source_url", url); record.set("service_type", serviceType); record.set("status", status); record.set("offline_capable", false);
    app.save(record);
  });
}, (app) => {});
