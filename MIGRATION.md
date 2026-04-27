# FungiMap — PocketBase Migration Plan

## Collections Schema

### users (auth collection)
- email (unique)
- password
- name (text, required)
- avatar (file, max 2MB, single)
- points (number, default 0)
- merits (select, multiple)
- last_lat (number)
- last_lng (number)
- last_seen (date)
- role (select: "user" | "expert" | "admin", default "user")
- created (auto)
- updated (auto)

Auth methods: email/password, Google OAuth2

### sightings
- user (relation → users, required)
- mushroom_name (text, required)
- description (text, required)
- toxicity (select: "Comestible"|"Tóxico"|"Mortal"|"Desconocido", default "Desconocido")
- habitat (text)
- features (text)
- lat (number, required)
- lng (number, required)
- geohash (text, indexed)
- images (file, max 10, max 5MB each)
- status (select: "identified"|"unconfirmed"|"expert_verified"|"draft", default "draft")
- network_id (text)
- geofirmed_by (relation → users)
- geofirmed_at (date)
- ai_analysis (json)
- created (auto)
- updated (auto)

### comments
- sighting (relation → sightings, required)
- user (relation → users, required)
- text (text, required, max 1000)
- created (auto)
- updated (auto)

### chat_messages
- user (relation → users, required)
- text (text, required, max 500)
- lat (number, required)
- lng (number, required)
- created (auto)

### reports
- reporter (relation → users, required)
- type (select: "message"|"user"|"sighting"|"comment", required)
- target_id (text, required)
- reason (text, required)
- content (text)
- status (select: "pending"|"reviewed"|"dismissed", default "pending")
- created (auto)
- updated (auto)

### logs
- user (relation → users)
- action (text, required)
- details (text)
- created (auto)

## API Rules

### sightings
- list: "" (public)
- view: "" (public)
- create: @request.auth.id != ""
- update: @request.auth.id = user.id || @request.auth.role = "admin"
- delete: @request.auth.id = user.id || @request.auth.role = "admin"

### comments
- list: "" (public)
- view: "" (public)
- create: @request.auth.id != "" && @request.body.user:isset = false
- update: @request.auth.id = user.id
- delete: @request.auth.id = user.id || @request.auth.role = "admin"

### chat_messages
- list: @request.auth.id != ""
- view: @request.auth.id != ""
- create: @request.auth.id != ""
- update: locked
- delete: @request.auth.role = "admin"

### reports
- list: @request.auth.role = "admin"
- view: @request.auth.role = "admin"
- create: @request.auth.id != ""
- update: @request.auth.role = "admin"
- delete: @request.auth.role = "admin"

### logs
- list: @request.auth.role = "admin"
- view: @request.auth.role = "admin"
- create: @request.auth.id != ""
- update: locked
- delete: locked

## Docker Architecture

```
fungimap/
├── docker-compose.yml
├── pocketbase/
│   ├── Dockerfile
│   └── pb_data/ (volume)
├── web/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── dist/ (React build)
```

PocketBase runs on :8090
Web (nginx) runs on :80
Traefik routes /api/* and /_/* to PocketBase
Traefik routes /* to nginx

## Frontend SDK

npm install pocketbase

```ts
import PocketBase from 'pocketbase';
const pb = new PocketBase('https://fungimap.lab.embudo.com.ar');

// Auth
await pb.collection('users').authWithPassword(email, password);
await pb.collection('users').authWithOAuth2({ provider: 'google' });

// CRUD
await pb.collection('sightings').create(formData); // auto-handles file uploads
await pb.collection('sightings').getList(1, 50, { filter: `geohash ~ '${prefix}'` });

// Realtime
pb.collection('sightings').subscribe('*', (e) => { ... });
pb.collection('chat_messages').subscribe('*', (e) => { ... });

// Files
const url = pb.files.getURL(record, record.images[0]);
```
