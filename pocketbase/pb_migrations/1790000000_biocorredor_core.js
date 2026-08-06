/// <reference path="../pb_data/types.d.ts" />

function addUserRoleValues(app) {
  const users = app.findCollectionByNameOrId("users");
  const role = users.fields.find((f) => f.name === "role");
  if (role && role.values) {
    ["observador", "coordinador", "administrador"].forEach((value) => {
      if (!role.values.includes(value)) role.values.push(value);
    });
    app.save(users);
  }
}

function saveCollection(app, name, fields, rules, indexes) {
  const collection = new Collection({
    type: "base",
    name,
    listRule: rules.listRule,
    viewRule: rules.viewRule,
    createRule: rules.createRule,
    updateRule: rules.updateRule,
    deleteRule: rules.deleteRule,
    fields,
    indexes: indexes || [],
  });
  app.save(collection);
  return app.findCollectionByNameOrId(name);
}

function text(name, required) {
  return { name, type: "text", required: !!required };
}

function editor(name, required) {
  return { name, type: "editor", required: !!required };
}

function json(name, required) {
  return { name, type: "json", required: !!required };
}

function number(name, required) {
  return { name, type: "number", required: !!required };
}

function date(name, required) {
  return { name, type: "date", required: !!required };
}

function select(name, values, required, maxSelect) {
  return { name, type: "select", required: !!required, maxSelect: maxSelect || 1, values };
}

function relation(name, collectionId, required, maxSelect) {
  return {
    name,
    type: "relation",
    required: !!required,
    collectionId,
    maxSelect: maxSelect || 1,
    cascadeDelete: false,
  };
}

function file(name, required, maxSelect, maxSize) {
  return {
    name,
    type: "file",
    required: !!required,
    maxSelect: maxSelect || 1,
    maxSize: maxSize || 104857600,
  };
}

function createRecord(app, collection, data) {
  const record = new Record(collection);
  Object.keys(data).forEach((key) => record.set(key, data[key]));
  app.save(record);
  return record;
}

migrate((app) => {
  addUserRoleValues(app);

  const users = app.findCollectionByNameOrId("users");
  const userId = users.id;
  const coordinatorRule = "@request.auth.role = 'coordinador' || @request.auth.role = 'administrador' || @request.auth.role = 'admin'";
  const adminRule = "@request.auth.role = 'administrador' || @request.auth.role = 'admin'";
  const authedRule = "@request.auth.id != ''";

  const projects = saveCollection(app, "projects", [
    text("code", true),
    text("name", true),
    editor("description", false),
    text("organization", false),
    json("area_geojson", false),
    select("status", ["draft", "active", "archived"], false),
    number("public_coordinate_precision_m", false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule,
  }, [
    "CREATE UNIQUE INDEX idx_projects_code ON {{projects}} (code)",
  ]);

  const protocols = saveCollection(app, "protocols", [
    text("code", true),
    text("version", true),
    text("title", true),
    editor("description", false),
    text("sampling_method", false),
    json("required_fields_json", false),
    select("status", ["draft", "active", "archived"], false),
    file("document", false, 1, 52428800),
    text("document_sha256", false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule,
  }, [
    "CREATE UNIQUE INDEX idx_protocols_code_version ON {{protocols}} (code, version)",
  ]);

  const sites = saveCollection(app, "sites", [
    relation("project", projects.id, true),
    text("code", true),
    text("name", true),
    select("type", ["sector", "transect", "plot", "fixed_point", "general_area"], true),
    json("geometry_geojson", false),
    text("habitat", false),
    editor("description", false),
    editor("access_notes", false),
    select("status", ["draft", "active", "archived"], false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: coordinatorRule,
    updateRule: coordinatorRule,
    deleteRule: adminRule,
  }, [
    "CREATE UNIQUE INDEX idx_sites_project_code ON {{sites}} (project, code)",
  ]);

  const surveyEvents = saveCollection(app, "survey_events", [
    text("event_id", true),
    relation("project", projects.id, true),
    relation("site", sites.id, false),
    relation("protocol", protocols.id, false),
    text("title", true),
    text("team_name", false),
    json("participants", false),
    date("started_at", false),
    date("ended_at", false),
    number("duration_minutes", false),
    number("distance_m", false),
    number("area_m2", false),
    number("observers_count", false),
    text("sampling_effort", false),
    json("track_geojson", false),
    text("weather", false),
    text("habitat", false),
    editor("notes", false),
    select("status", ["draft", "active", "completed", "reviewed", "sealed"], false),
    relation("created_by", userId, true),
    date("sealed_at", false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: authedRule,
    updateRule: authedRule,
    deleteRule: adminRule,
  }, [
    "CREATE UNIQUE INDEX idx_survey_events_event_id ON {{survey_events}} (event_id)",
    "CREATE INDEX idx_survey_events_status ON {{survey_events}} (status)",
  ]);
  surveyEvents.fields.add(new RelationField({
    name: "parent_event",
    required: false,
    collectionId: surveyEvents.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(surveyEvents);

  const occurrences = saveCollection(app, "occurrences", [
    text("occurrence_id", true),
    relation("event", surveyEvents.id, true),
    relation("observer", userId, true),
    date("observed_at", false),
    number("latitude", false),
    number("longitude", false),
    number("coordinate_uncertainty_m", false),
    text("location_source", false),
    text("field_name", false),
    text("scientific_name", false),
    select("taxon_group", ["fungi", "flora", "fauna", "insect", "bird", "mammal", "reptile", "amphibian", "other"], false),
    number("quantity", false),
    text("quantity_unit", false),
    text("life_stage", false),
    text("behavior", false),
    text("substrate", false),
    text("microhabitat", false),
    select("occurrence_status", ["detected", "not_detected"], false),
    select("identification_status", ["unidentified", "community_suggestion", "pending_review", "probable", "confirmed", "rejected"], false),
    select("sensitive_record", ["false", "true"], false),
    select("public_visibility", ["private", "team", "validated_public", "generalized_public"], false),
    editor("notes", false),
    select("local_status", ["local_only", "pending", "syncing", "synced", "conflict", "failed"], false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: authedRule,
    updateRule: authedRule,
    deleteRule: adminRule,
  }, [
    "CREATE UNIQUE INDEX idx_occurrences_occurrence_id ON {{occurrences}} (occurrence_id)",
    "CREATE INDEX idx_occurrences_event ON {{occurrences}} (event)",
    "CREATE INDEX idx_occurrences_observer ON {{occurrences}} (observer)",
  ]);

  const territorialChanges = saveCollection(app, "territorial_changes", [
    relation("event", surveyEvents.id, true),
    relation("observer", userId, true),
    select("change_type", ["clearing", "filling", "soil_movement", "road_opening", "fencing", "fire", "waste", "watercourse_change", "machinery", "construction", "vegetation_loss", "other"], true),
    date("observed_at", false),
    number("latitude", false),
    number("longitude", false),
    number("coordinate_uncertainty_m", false),
    json("geometry_geojson", false),
    number("estimated_area_m2", false),
    editor("objective_description", true),
    select("initial_severity", ["low", "medium", "high", "unknown"], false),
    select("status", ["draft", "pending_review", "reviewed", "dismissed"], false),
    select("public_visibility", ["private", "team", "validated_public", "generalized_public"], false),
    editor("notes", false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: authedRule,
    updateRule: authedRule,
    deleteRule: adminRule,
  }, [
    "CREATE INDEX idx_territorial_changes_event ON {{territorial_changes}} (event)",
  ]);

  const mediaEvidence = saveCollection(app, "media_evidence", [
    relation("occurrence", occurrences.id, false),
    relation("territorial_change", territorialChanges.id, false),
    relation("survey_event", surveyEvents.id, false),
    file("original_file", false, 1, 157286400),
    file("preview_file", false, 1, 10485760),
    text("sha256", false),
    text("mime_type", false),
    number("file_size", false),
    date("captured_at", false),
    date("uploaded_at", false),
    number("latitude", false),
    number("longitude", false),
    json("exif_json", false),
    json("device_info", false),
    select("media_type", ["photo", "audio", "video", "document"], false),
    select("is_original", ["false", "true"], false),
    select("sync_status", ["local_only", "pending", "syncing", "synced", "conflict", "failed"], false),
    relation("created_by", userId, true),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: authedRule,
    updateRule: authedRule,
    deleteRule: adminRule,
  }, [
    "CREATE INDEX idx_media_occurrence ON {{media_evidence}} (occurrence)",
    "CREATE INDEX idx_media_change ON {{media_evidence}} (territorial_change)",
    "CREATE INDEX idx_media_sha256 ON {{media_evidence}} (sha256)",
  ]);

  const identifications = saveCollection(app, "identifications", [
    relation("occurrence", occurrences.id, true),
    text("scientific_name", true),
    text("vernacular_name", false),
    text("taxon_id", false),
    text("taxon_rank", false),
    relation("identified_by", userId, true),
    date("identified_at", false),
    number("confidence", false),
    editor("diagnostic_features", false),
    editor("references", false),
    select("status", ["suggested", "probable", "confirmed", "rejected", "superseded"], false),
    editor("notes", false),
  ], {
    listRule: authedRule,
    viewRule: authedRule,
    createRule: coordinatorRule,
    updateRule: coordinatorRule,
    deleteRule: adminRule,
  }, [
    "CREATE INDEX idx_identifications_occurrence ON {{identifications}} (occurrence)",
  ]);
  identifications.fields.add(new RelationField({
    name: "supersedes",
    required: false,
    collectionId: identifications.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(identifications);

  const auditLog = saveCollection(app, "audit_log", [
    relation("actor", userId, false),
    text("action", true),
    text("collection_name", true),
    text("record_id", false),
    date("timestamp", true),
    editor("reason", false),
    json("metadata_json", false),
  ], {
    listRule: coordinatorRule,
    viewRule: coordinatorRule,
    createRule: authedRule,
    updateRule: null,
    deleteRule: adminRule,
  }, [
    "CREATE INDEX idx_audit_record ON {{audit_log}} (collection_name, record_id)",
  ]);

  const exportManifests = saveCollection(app, "export_manifests", [
    relation("project", projects.id, true),
    relation("survey_event", surveyEvents.id, false),
    date("generated_at", true),
    relation("generated_by", userId, true),
    number("record_count", false),
    number("media_count", false),
    json("files_json", false),
    text("manifest_sha256", false),
    file("manifest_file", false, 1, 10485760),
  ], {
    listRule: coordinatorRule,
    viewRule: coordinatorRule,
    createRule: coordinatorRule,
    updateRule: coordinatorRule,
    deleteRule: adminRule,
  }, [
    "CREATE INDEX idx_export_project_event ON {{export_manifests}} (project, survey_event)",
  ]);

  const project = createRecord(app, projects, {
    code: "BIOCORREDOR-MR",
    name: "Biocorredor de Ministro Rivadavia",
    description: "Sistema comunitario de registro de biodiversidad y transformaciones territoriales del Biocorredor de Ministro Rivadavia.",
    organization: "Biocorredor MR",
    status: "active",
    public_coordinate_precision_m: 1000,
  });

  const protocol = createRecord(app, protocols, {
    code: "INV-GENERAL",
    version: "1.0",
    title: "Inventario comunitario general",
    description: "Protocolo inicial para recorridos comunitarios con esfuerzo registrado.",
    sampling_method: "recorrido libre con esfuerzo registrado",
    required_fields_json: { p0: ["event", "observer", "observed_at", "field_name_or_group"] },
    status: "active",
  });

  const sectorNorte = createRecord(app, sites, {
    project: project.id,
    code: "SEC-NORTE",
    name: "Sector Norte",
    type: "sector",
    habitat: "mosaico de pastizal, arbolado y bordes urbanos",
    status: "active",
  });
  const sectorCentro = createRecord(app, sites, {
    project: project.id,
    code: "SEC-CENTRO",
    name: "Sector Centro",
    type: "sector",
    habitat: "area general de relevamiento comunitario",
    status: "active",
  });
  const sectorSur = createRecord(app, sites, {
    project: project.id,
    code: "SEC-SUR",
    name: "Sector Sur",
    type: "sector",
    habitat: "humedal, caminos y sectores periurbanos",
    status: "active",
  });

  const demoUsers = [
    ["obs1@biocorredor.local", "Observadora Demo 1", "observador"],
    ["obs2@biocorredor.local", "Observador Demo 2", "observador"],
    ["obs3@biocorredor.local", "Observadora Demo 3", "observador"],
    ["coord@biocorredor.local", "Coordinacion Demo", "coordinador"],
    ["admin@biocorredor.local", "Administracion Demo", "administrador"],
  ].map(([email, name, role]) => {
    const user = new Record(users);
    user.setEmail(email);
    user.setPassword("BiocorredorDemo2026!");
    user.set("name", name);
    user.set("role", role);
    user.set("verified", true);
    app.save(user);
    return user;
  });

  const event = createRecord(app, surveyEvents, {
    event_id: "BIO-MR-PILOTO-2026-08-11",
    project: project.id,
    site: sectorCentro.id,
    protocol: protocol.id,
    title: "Jornada piloto Biocorredor MR",
    team_name: "Equipo Piloto",
    participants: [
      { name: "Observadora Demo 1", role: "observador" },
      { name: "Observador Demo 2", role: "observador" },
      { name: "Coordinacion Demo", role: "coordinador" },
    ],
    started_at: "2026-08-11 10:00:00.000Z",
    observers_count: 5,
    sampling_effort: "recorrido libre de ensayo",
    weather: "templado, parcialmente nublado",
    habitat: "mosaico periurbano",
    status: "active",
    created_by: demoUsers[3].id,
  });

  const occurrenceNames = [
    ["OBS-PILOTO-001", "Hongo observado", "fungi", -34.8291, -58.3761, 12, "private"],
    ["OBS-PILOTO-002", "Planta nativa en flor", "flora", -34.8288, -58.3752, 18, "private"],
    ["OBS-PILOTO-003", "Ave observada", "bird", -34.8279, -58.3745, 30, "private"],
    ["OBS-PILOTO-004", "Insecto sobre vegetacion", "insect", -34.8299, -58.3771, 20, "private"],
    ["OBS-PILOTO-005", "Rastro de mamifero", "mammal", -34.8302, -58.3783, 45, "private"],
    ["OBS-PILOTO-006", "Hongo no identificado", "fungi", -34.831, -58.379, 25, "private"],
    ["OBS-PILOTO-007", "Vegetacion acuatica", "flora", -34.8268, -58.3737, 15, "private"],
    ["OBS-PILOTO-008", "Registro sensible", "fauna", -34.826, -58.3729, 10, "private"],
    ["OBS-PILOTO-009", "Observacion sin GPS", "other", null, null, null, "private"],
    ["OBS-PILOTO-010", "Hongo con foto pendiente", "fungi", -34.8255, -58.3718, 22, "private"],
  ];

  occurrenceNames.forEach((item, index) => {
    createRecord(app, occurrences, {
      occurrence_id: item[0],
      event: event.id,
      observer: demoUsers[index % 3].id,
      observed_at: `2026-08-11 1${index}:15:00.000Z`,
      latitude: item[3],
      longitude: item[4],
      coordinate_uncertainty_m: item[5],
      location_source: item[3] === null ? "pending" : "gps",
      field_name: item[1],
      taxon_group: item[2],
      quantity: 1,
      quantity_unit: "individuos",
      occurrence_status: "detected",
      identification_status: "unidentified",
      sensitive_record: index === 7 ? "true" : "false",
      public_visibility: item[6],
      local_status: index === 9 ? "pending" : "synced",
      notes: index === 9 ? "Foto pendiente de sincronizacion." : "Registro de demostracion.",
    });
  });

  [
    ["clearing", "Se observa remocion de vegetacion y suelo expuesto en aproximadamente 200 m2.", sectorNorte.id],
    ["waste", "Se observa acumulacion de residuos dispersos junto al camino.", sectorCentro.id],
    ["watercourse_change", "Se observa modificacion reciente en margen de curso de agua.", sectorSur.id],
  ].forEach((item, index) => {
    createRecord(app, territorialChanges, {
      event: event.id,
      observer: demoUsers[index].id,
      change_type: item[0],
      observed_at: `2026-08-11 12:${index}0:00.000Z`,
      latitude: -34.829 + index * 0.001,
      longitude: -58.376 - index * 0.001,
      coordinate_uncertainty_m: 25,
      estimated_area_m2: index === 0 ? 200 : null,
      objective_description: item[1],
      initial_severity: index === 0 ? "medium" : "unknown",
      status: "pending_review",
      public_visibility: "private",
      notes: "Registro territorial de demostracion.",
    });
  });

  createRecord(app, auditLog, {
    actor: demoUsers[4].id,
    action: "seed_demo_data",
    collection_name: "projects",
    record_id: project.id,
    timestamp: "2026-08-06 00:00:00.000Z",
    reason: "Datos iniciales del MVP Biocorredor MR.",
    metadata_json: { migration: "1790000000_biocorredor_core" },
  });

  createRecord(app, exportManifests, {
    project: project.id,
    survey_event: event.id,
    generated_at: "2026-08-06 00:00:00.000Z",
    generated_by: demoUsers[4].id,
    record_count: 14,
    media_count: 0,
    files_json: { demo: true, files: [] },
    manifest_sha256: "",
  });
}, (app) => {
  [
    "export_manifests",
    "audit_log",
    "identifications",
    "media_evidence",
    "territorial_changes",
    "occurrences",
    "survey_events",
    "sites",
    "protocols",
    "projects",
  ].forEach((name) => {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch (e) {}
  });

  ["obs1@biocorredor.local", "obs2@biocorredor.local", "obs3@biocorredor.local", "coord@biocorredor.local", "admin@biocorredor.local"].forEach((email) => {
    try {
      const user = app.findAuthRecordByEmail("users", email);
      app.delete(user);
    } catch (e) {}
  });
});
