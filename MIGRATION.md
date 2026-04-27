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


## 7. AI / Computer Vision

### FGVC Fungi Classification Competition
**Status:** Backlog (pending)

**Overview:**
- Source: FGVCx (Fungi Classification) competition on Kaggle/visipedia
- Dataset: 100,000+ high-quality classified fungi images
- Classes: 1500+ fungal species
- Resolution: 512x512, 224x224, 640x640px
- Quality: Expert-verified, curated by mycologists

**Use Cases:**
1. **Image classification** — Identify mushroom species from photo (same as current Gemini integration)
2. **Feature extraction** — Cap shape, gill attachment, stem type, color patterns
3. **Pre-training** — Fine-tune generic mushroom model on FGVC data
4. **Benchmarking** — Compare current Gemini API vs trained local model

**Implementation Approach:**
- Download FGVC dataset (CSV + images ~5GB)
- Train MobileNet/EfficientNet on fungal classes
- Serve via ONNX Runtime (TensorFlow.js)
- Browser-based inference → no external API calls
- Faster, cheaper, offline-capable

**Technical Details:**
- Framework: TensorFlow.js or ONNX Runtime Web
- Model size: ~10MB (compressed)
- Inference time: ~100-200ms on browser
- Accuracy target: Top-5 accuracy > 80%

**Integration with FungiMap:**
- Replace/supplement Gemini API with local model
- Add "Modelo IA: Local (FGVC)" toggle in settings
- Hybrid mode: Fall back to Gemini if species not in FGVC classes
- Upload model to user's device for offline inference

**Resources:**
- Dataset: https://www.kaggle.com/c/fgvcx-fungi-classification
- Paper: https://arxiv.org/abs/1910.09345
- GitHub implementations: Search "FGVCx" on GitHub

**Comparison with Gemini:**
| Feature | Gemini API | Local FGVC Model |
|---------|------------|------------------|
| Latency | 1-2s | 100-200ms |
| Cost | Free tier (15K/mo) | One-time (compute + storage) |
| Privacy | Data sent to Google | On-device |
| Species | General knowledge | 1500+ fungi classes |
| Accuracy | Medium (generalist) | High (specialized) |

**Next Steps:**
1. Download FGVC dataset to /data/fgvc/
2. Set up TensorFlow.js training pipeline
3. Train baseline model (MobileNetV2 on fungal classes)
4. Convert to ONNX for browser inference
5. Integrate inference hook into NewSightingModal
6. Add model selection toggle (Local FGVC vs Gemini Cloud)

**Dependencies:**
- Python: TensorFlow, OpenCV, pandas
- JS: TensorFlow.js or onnxruntime-web
- Storage: ~10GB for dataset
- Compute: GPU for training (optional, CPU for fine-tuning)

---


