# AgriVision AI — React Frontend

A beginner-friendly React app (built with Vite) with a map for marking a
field, which calls your **deployed AWS backend** at
`http://13.49.238.72:8000` to run crop-health analysis.

## Setup

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Before it fully works

1. **Check the request schema.** Open
   `http://13.49.238.72:8000/docs`, expand
   `POST /api/crop-health/analyze`, and click "Try it out" to see the
   exact JSON keys it expects. Then update `buildRequestBody()` in
   `src/App.jsx` (clearly marked with a comment) to match — the code
   currently assumes `{ "polygon": [[lat,lng], ...] }`.

2. **Enable CORS on the backend**, so the browser will let this page
   talk to a different origin (your EC2 IP):

   ```python
   from fastapi.middleware.cors import CORSMiddleware

   app.add_middleware(
       CORSMiddleware,
       allow_origins=["*"],   # fine for testing; restrict later
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

## Project structure

```
src/
├── main.jsx              # mounts the app, loads Leaflet's CSS
├── App.jsx               # page layout, state, and the API call
├── App.css               # styling
└── components/
    └── FieldMap.jsx      # the Leaflet map: click to mark 4 corners
```

## How the map works

- Click up to 4 times to place field corner markers.
- Once all 4 are placed, the outline is drawn automatically and the
  map zooms to fit it.
- "Reset points" clears everything and lets you start over.
- "Analyze Crop Health" sends the 4 points to your AWS API and shows
  the response (both a best-effort readable summary and the full raw
  JSON, so you can see exactly what came back while you're wiring up
  field names).
