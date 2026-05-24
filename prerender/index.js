const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const PB_URL = process.env.PB_URL || 'http://fungimap-pb:8090';
const APP_URL = process.env.APP_URL || 'https://map.funga.com.ar';
const MONEYSITE_URL = process.env.MONEYSITE_URL || 'https://funga.com.ar';

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

async function fetchSighting(id) {
  const cacheKey = `sighting:${id}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${PB_URL}/api/collections/sightings/records/${id}?expand=user`, {
      headers: { 'Accept': 'application/json' },
      timeout: 5000,
    });
    if (!res.ok) {
      if (res.status === 404) return { notFound: true };
      throw new Error(`PB error: ${res.status}`);
    }
    const data = await res.json();
    setCached(cacheKey, data);
    return data;
  } catch (err) {
    console.error('[prerender] PB fetch failed:', err.message);
    return { error: true };
  }
}

function getFileUrl(collection, recordId, filename) {
  if (!filename) return null;
  return `${PB_URL}/api/files/${collection}/${recordId}/${filename}`;
}

function buildTaxonomy(s) {
  const levels = [];
  if (s.kingdom) levels.push({ name: 'Reino', value: s.kingdom });
  if (s.phylum) levels.push({ name: 'División', value: s.phylum });
  if (s.taxon_class) levels.push({ name: 'Clase', value: s.taxon_class });
  if (s.taxon_order) levels.push({ name: 'Orden', value: s.taxon_order });
  if (s.family) levels.push({ name: 'Familia', value: s.family });
  if (s.genus) levels.push({ name: 'Género', value: s.genus });
  if (s.species) levels.push({ name: 'Especie', value: s.species });
  return levels;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPage({ title, description, image, url, schema, bodyContent, id }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image || APP_URL + '/og-image.png')}">
  <meta property="og:site_name" content="Funga Map">
  <meta property="og:locale" content="es_AR">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image || APP_URL + '/og-image.png')}">
  
  <!-- Schema.org -->
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  
  <style>
    :root {
      --paper: #FAF8F5;
      --ink: #1C1917;
      --earth: #8B6B4E;
      --earth-light: #D4C5B5;
      --stone: #E8E4DF;
      --muted: #78716C;
      --warning: #B45309;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--paper);
      color: var(--ink);
      line-height: 1.6;
      min-height: 100vh;
    }
    .container { max-width: 640px; margin: 0 auto; padding: 24px 20px 120px; }
    .header {
      text-align: center;
      padding: 32px 0 24px;
      border-bottom: 1px solid var(--stone);
      margin-bottom: 28px;
    }
    .logo {
      width: 48px; height: 48px;
      margin-bottom: 12px;
    }
    .brand {
      font-family: Georgia, 'Times New Roman', serif;
      font-style: italic;
      font-size: 26px;
      color: var(--ink);
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: var(--muted);
      margin-top: 4px;
    }
    .observation {
      background: white;
      border: 1px solid var(--stone);
      padding: 24px;
      margin-bottom: 20px;
    }
    .observation-image {
      width: 100%;
      border-radius: 4px;
      margin-bottom: 20px;
      display: block;
    }
    .observation-title {
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 22px;
      margin-bottom: 8px;
    }
    .observation-meta {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 16px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .meta-tag {
      background: var(--stone);
      padding: 2px 8px;
      border-radius: 2px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .taxonomy {
      margin: 16px 0;
      padding: 16px;
      background: var(--paper);
      border-left: 3px solid var(--earth);
    }
    .taxonomy-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--earth);
      margin-bottom: 8px;
    }
    .taxonomy-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--stone);
      font-size: 13px;
    }
    .taxonomy-row:last-child { border-bottom: none; }
    .taxonomy-label { color: var(--muted); font-size: 12px; }
    .taxonomy-value { font-weight: 500; }
    .description {
      font-size: 14px;
      color: var(--muted);
      margin: 16px 0;
      font-style: italic;
    }
    .map-placeholder {
      width: 100%;
      height: 200px;
      background: var(--stone);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 12px;
      margin: 16px 0;
      border-radius: 4px;
    }
    .disclaimer {
      margin: 20px 0;
      padding: 16px;
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      border-radius: 4px;
      font-size: 13px;
      color: var(--warning);
      line-height: 1.5;
    }
    .disclaimer strong {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .cta {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: var(--ink);
      padding: 16px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
      z-index: 100;
    }
    .cta-text {
      color: var(--paper);
      font-size: 12px;
      text-align: center;
      font-style: italic;
      opacity: 0.8;
    }
    .cta-button {
      background: var(--earth);
      color: white;
      border: none;
      padding: 12px 32px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .cta-secondary {
      color: var(--earth-light);
      font-size: 10px;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
    .money-site {
      text-align: center;
      margin: 24px 0 8px;
      padding-top: 16px;
      border-top: 1px solid var(--stone);
    }
    .money-site a {
      font-family: Georgia, serif;
      font-style: italic;
      color: var(--earth);
      text-decoration: none;
      font-size: 16px;
    }
    .money-site p {
      font-size: 11px;
      color: var(--muted);
      margin-top: 4px;
    }
    @media (min-width: 640px) {
      .container { padding: 40px 24px 140px; }
      .cta { flex-direction: row; justify-content: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" stroke="#1C1917" stroke-width="1.5" stroke-dasharray="4 4"/>
        <path d="M24 14c-2 0-4 2-4 5s2 6 4 8c2-2 4-5 4-8s-2-5-4-5z" fill="#8B6B4E"/>
        <path d="M20 22c-3 2-5 5-4 8s4 5 8 5 7-2 8-5-1-6-4-8" stroke="#8B6B4E" stroke-width="1.5" fill="none"/>
      </svg>
      <div class="brand">Funga Map</div>
      <div class="subtitle">Atlas Micológico Colaborativo</div>
    </div>
    ${bodyContent}
    <div class="money-site">
      <a href="${MONEYSITE_URL}" target="_blank">Funga — Hongos Silvestres de Sudamérica</a>
      <p>Productos, comunidad y conocimiento micológico.</p>
    </div>
  </div>
  <div class="cta">
    <div class="cta-text">
      Esta observación forma parte de un atlas colaborativo gestionado por la comunidad.
      Registrate para explorar el mapa completo, identificar especies con IA y contribuir.
    </div>
    <a href="${APP_URL}/?redirect=/observacion/${id || ''}" class="cta-button">Ingresar al Atlas</a>
    <a href="${MONEYSITE_URL}" class="cta-secondary" target="_blank">Conocé Funga →</a>
  </div>
</body>
</html>`;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/observacion/:id', async (req, res) => {
  const { id } = req.params;
  const data = await fetchSighting(id);

  if (data.error) {
    return res.status(503).send(renderPage({
      title: 'Funga Map — Atlas Micológico Colaborativo',
      description: 'Servicio temporalmente no disponible. Intentá de nuevo en unos minutos.',
      url: `${APP_URL}/observacion/${id}`,
      schema: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Funga Map' },
      bodyContent: `
        <div class="observation" style="text-align:center;padding:40px">
          <p style="color:var(--muted);font-style:italic">No pudimos cargar esta observación. El servidor de datos puede estar en mantenimiento.</p>
          <a href="${APP_URL}/?redirect=/observacion/${id || ''}" class="cta-button">Ingresar al Atlas</a>
        </div>`,
      id,
    }));
  }

  if (data.notFound || data.public === false) {
    return res.status(404).send(renderPage({
      title: 'Observación no encontrada — Funga Map',
      description: 'Esta observación no existe o ha sido marcada como privada.',
      url: `${APP_URL}/observacion/${id}`,
      schema: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Observación no encontrada' },
      bodyContent: `
        <div class="observation" style="text-align:center;padding:40px">
          <div class="observation-title" style="font-size:18px">Observación no disponible</div>
          <p style="color:var(--muted);font-size:13px;margin-top:12px">
            Puede haber sido eliminada, o su autor decidió mantenerla privada.
          </p>
          <a href="${APP_URL}/?redirect=/observacion/${id || ''}" class="cta-button" style="margin-top:24px;display:inline-block">Explorar el Atlas</a>
        </div>`,
      id,
    }));
  }

  const s = data;
  const user = s.expand?.user || {};
  // Try local images first, then gbif_image_url, then fallback to OG image
  const imageUrl = s.images?.[0] 
    ? getFileUrl('sightings', s.id, s.images[0]) 
    : s.gbif_image_url || null;
  const taxonomy = buildTaxonomy(s);
  const locationParts = [s.locality, s.state_province, s.country].filter(Boolean);
  const locationText = locationParts.join(', ') || `${s.lat?.toFixed(3)}, ${s.lng?.toFixed(3)}`;
  
  const title = s.species || s.mushroom_name || 'Observación micológica';
  const fullTitle = `${title} — ${locationText} — Funga Map`;
  const description = s.description 
    ? `${s.description.substring(0, 150)}${s.description.length > 150 ? '...' : ''} — ${locationText}`
    : `Observación de ${title} en ${locationText}. Atlas colaborativo de hongos silvestres de Sudamérica.`;

  const taxonomyHtml = taxonomy.length > 0 ? `
    <div class="taxonomy">
      <div class="taxonomy-title">Clasificación Taxonómica</div>
      ${taxonomy.map(t => `
        <div class="taxonomy-row">
          <span class="taxonomy-label">${t.name}</span>
          <span class="taxonomy-value">${escapeHtml(t.value)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const bodyContent = `
    <div class="observation">
      ${imageUrl ? `<img class="observation-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="eager" crossorigin="anonymous">` : ''}
      <div class="observation-title">${escapeHtml(title)}</div>
      <div class="observation-meta">
        ${s.status ? `<span class="meta-tag">${escapeHtml(s.status === 'expert_verified' ? 'Verificado por experto' : s.status === 'unconfirmed' ? 'Pendiente de confirmación' : s.status)}</span>` : ''}
        ${s.toxicity ? `<span class="meta-tag" style="background:${s.toxicity === 'Mortal' ? '#FECACA' : s.toxicity === 'Tóxico' ? '#FED7AA' : '#D1FAE5'};color:${s.toxicity === 'Mortal' ? '#991B1B' : s.toxicity === 'Tóxico' ? '#92400E' : '#065F46'}">${escapeHtml(s.toxicity)}</span>` : ''}
        <span class="meta-tag">${escapeHtml(locationText)}</span>
        ${s.event_date ? `<span class="meta-tag">${new Date(s.event_date).toLocaleDateString('es-AR')}</span>` : ''}
      </div>
      ${s.description ? `<div class="description">${escapeHtml(s.description)}</div>` : ''}
      ${taxonomyHtml}
      <div class="disclaimer">
        <strong>Aviso de la comunidad</strong>
        Esta observación forma parte de un atlas colaborativo en construcción. 
        La identificación taxonómica proviene de reconocimiento asistido por inteligencia artificial 
        y/o contribuciones de observadores. No constituye una determinación científica oficial. 
        Para consumo o tratamiento medicinal, consultá siempre a un micólogo certificado.
        La precisión de los datos depende del esfuerzo colectivo — tu participación fortalece 
        la calidad de la base.
      </div>
      <div class="map-placeholder">
        📍 ${s.lat?.toFixed(4)}, ${s.lng?.toFixed(4)}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:center">
        Registrado por ${escapeHtml(user.name || 'un observador de la comunidad')}
      </div>
    </div>
  `;

  const schema = {
    '@context': 'https://schema.org',
    '@type': ['ImageObject', 'Observation'],
    name: title,
    description: description,
    contentUrl: imageUrl || APP_URL + '/og-image.png',
    url: `${APP_URL}/observacion/${id}`,
    creator: {
      '@type': 'Person',
      name: user.name || 'Observador Funga Map'
    },
    contentLocation: {
      '@type': 'Place',
      geo: {
        '@type': 'GeoCoordinates',
        latitude: s.lat,
        longitude: s.lng
      },
      name: locationText
    },
    dateCreated: s.event_date || s.created,
    about: taxonomy.length > 0 ? {
      '@type': 'Thing',
      name: s.species || s.mushroom_name,
      additionalProperty: taxonomy.map(t => ({
        '@type': 'PropertyValue',
        name: t.name,
        value: t.value
      }))
    } : undefined,
    license: 'https://creativecommons.org/licenses/by-sa/4.0/',
    isPartOf: {
      '@type': 'WebApplication',
      name: 'Funga Map',
      url: APP_URL
    }
  };

  res.send(renderPage({
    title: fullTitle,
    description,
    image: imageUrl,
    url: `${APP_URL}/observacion/${id}`,
    schema,
    bodyContent,
    id: s.id,
  }));
});

app.listen(PORT, () => {
  console.log(`[funga-prerender] listening on :${PORT}, PB: ${PB_URL}, APP: ${APP_URL}`);
});
