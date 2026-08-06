/// <reference path="../pb_data/types.d.ts" />

function idFor(type, name) { return `${type}_${name.replace(/[^a-z0-9]/gi, "_")}`.slice(0, 30); }
function text(name, required = false) { return new Field({ id: idFor("text", name), name, type: "text", required, hidden: false, presentable: false }); }
function number(name) { return new Field({ id: idFor("number", name), name, type: "number", required: false, hidden: false, presentable: false }); }
function date(name, required = false) { return new Field({ id: idFor("date", name), name, type: "date", required, hidden: false, presentable: false }); }
function json(name) { return new Field({ id: idFor("json", name), name, type: "json", required: false, hidden: false, presentable: false }); }
function url(name) { return new Field({ id: idFor("url", name), name, type: "url", required: false, hidden: false, presentable: false }); }
function bool(name) { return new Field({ id: idFor("bool", name), name, type: "bool", required: false, hidden: false, presentable: false }); }
function select(name, values, required = false) { return new Field({ id: idFor("select", name), name, type: "select", required, maxSelect: 1, values, hidden: false, presentable: false }); }
function relation(name, collectionId, required = false) { return new RelationField({ id: idFor("relation", name), name, required, collectionId, maxSelect: 1, cascadeDelete: false }); }
function add(collection, field) { if (!collection.fields.find((existing) => existing.name === field.name)) collection.fields.add(field); }

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const projects = app.findCollectionByNameOrId("projects");
  const occurrences = app.findCollectionByNameOrId("occurrences");
  const layers = app.findCollectionByNameOrId("territorial_layers");
  const parcels = app.findCollectionByNameOrId("parcels");
  const documents = app.findCollectionByNameOrId("parcel_documents");
  const alerts = app.findCollectionByNameOrId("territorial_alerts");

  [text("code", true), text("title", true), select("category", ["parcelas", "zonificacion", "normativa", "hidrologia", "biodiversidad", "transformaciones"], true), text("source_organization"), url("source_url"), select("service_type", ["WMS", "WFS", "WMS/WFS", "GeoJSON", "document", "internal"]), url("service_url"), text("attribution"), text("source_version"), date("last_verified_at"), bool("offline_capable"), json("style_json"), select("status", ["reference", "active", "disabled"])].forEach((field) => add(layers, field));
  app.save(layers);

  [relation("project", projects.id, true), text("parcel_code", true), text("cadastral_nomenclature"), text("partida"), number("surface_m2"), select("ownership_status", ["public", "private", "mixed", "no_documentado"]), text("ownership_source"), text("zoning_code"), text("ordinance_category"), json("geometry_geojson"), json("public_geometry_geojson"), json("environmental_value_json"), text("source_layer"), text("source_record_id"), date("last_verified_at"), select("status", ["active", "historic", "needs_review"])].forEach((field) => add(parcels, field));
  app.save(parcels);

  [relation("parcel", parcels.id, true), select("document_type", ["expediente", "ordenanza", "permiso", "DIA", "factibilidad_hidraulica", "localizacion", "convalidacion", "pedido_informacion"], true), text("title", true), text("expediente_number"), text("issuing_organization"), select("status", ["pendiente", "presentado", "aprobado", "rechazado", "no_documentado"]), url("document_url"), date("document_date"), text("document_sha256"), text("notes")].forEach((field) => add(documents, field));
  app.save(documents);

  [relation("parcel", parcels.id), relation("occurrence", occurrences.id), text("rule_code", true), select("alert_type", ["documentation_pending", "preservation_risk", "hydraulic_review", "protected_forest", "preliminary_urbanization", "missing_DIA", "baseline_change"], true), select("severity", ["low", "medium", "high"], true), json("evidence_json"), select("status", ["open", "under_review", "verified", "dismissed"], true), relation("created_by", users.id, true), relation("reviewed_by", users.id), text("review_notes"), date("created_at", true), date("reviewed_at")].forEach((field) => add(alerts, field));
  app.save(alerts);

  [relation("parcel", parcels.id), json("territorial_context_json"), select("territorial_context_status", ["pending", "matched", "indeterminate", "reviewed"])].forEach((field) => add(occurrences, field));
  app.save(occurrences);

  const catalog = [
    ["CADASTRO-PARCELAS", "Parcelas catastrales", "parcelas", "ARBA / IDEBA", "https://ideba.gba.gob.ar/es/visualizador/arba", "WMS/WFS", "reference"],
    ["ZONIFICACION-URBASIG", "Zonificacion vigente", "zonificacion", "urBAsig", "https://urbasig.mgob.gba.gob.ar/urbasig/", "WMS/WFS", "reference"],
    ["ORD-11819-20", "Ordenanza 11.819/20 y anexos", "normativa", "Municipio / Provincia", "https://boletinoficial.gba.gob.ar/secciones/11321/ver", "document", "reference"],
    ["HIDRO-FORESTACION", "Cursos de agua, inundabilidad y forestacion", "hidrologia", "IDEBA", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["BIODIVERSIDAD-AMBIENTES", "Biodiversidad y ambientes", "biodiversidad", "IDEBA / fuentes validadas", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["OBRAS-EXPEDIENTES", "Obras, cambios territoriales y expedientes", "transformaciones", "Biocorredor MR", "", "internal", "active"],
  ];
  const records = app.findAllRecords(layers);
  catalog.forEach((item, index) => {
    const record = records[index];
    if (!record) return;
    record.set("code", item[0]); record.set("title", item[1]); record.set("category", item[2]); record.set("source_organization", item[3]); record.set("source_url", item[4]); record.set("service_type", item[5]); record.set("status", item[6]); record.set("offline_capable", false); app.save(record);
  });
}, (app) => {});
