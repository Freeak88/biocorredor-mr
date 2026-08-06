/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const layers = app.findCollectionByNameOrId("territorial_layers");
  if (app.findAllRecords(layers).length > 0) return;

  const catalog = [
    ["CADASTRO-PARCELAS", "Parcelas catastrales", "parcelas", "ARBA / IDEBA", "https://ideba.gba.gob.ar/es/visualizador/arba", "WMS/WFS", "reference"],
    ["ZONIFICACION-URBASIG", "Zonificacion vigente", "zonificacion", "urBAsig", "https://urbasig.mgob.gba.gob.ar/urbasig/", "WMS/WFS", "reference"],
    ["ORD-11819-20", "Ordenanza 11.819/20 y anexos", "normativa", "Municipio / Provincia", "https://boletinoficial.gba.gob.ar/secciones/11321/ver", "document", "reference"],
    ["HIDRO-FORESTACION", "Cursos de agua, inundabilidad y forestacion", "hidrologia", "IDEBA", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["BIODIVERSIDAD-AMBIENTES", "Biodiversidad y ambientes", "biodiversidad", "IDEBA / fuentes validadas", "https://visualizador.ideba.gba.gob.ar/", "WMS/WFS", "reference"],
    ["OBRAS-EXPEDIENTES", "Obras, cambios territoriales y expedientes", "transformaciones", "Biocorredor MR", "https://biocorredor.local/territorio", "internal", "active"],
  ];

  catalog.forEach(([code, title, category, organization, sourceUrl, serviceType, status]) => {
    const record = new Record(layers);
    record.set("code", code);
    record.set("title", title);
    record.set("category", category);
    record.set("source_organization", organization);
    record.set("source_url", sourceUrl);
    record.set("service_type", serviceType);
    record.set("status", status);
    record.set("offline_capable", false);
    app.save(record);
  });
}, (app) => {});
