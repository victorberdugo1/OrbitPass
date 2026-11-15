# OrbitPass — Lunar Landing Site Navigator

OrbitPass is a browser-based lunar mission explorer. It combines a real-time 3D Earth–Moon scene, a 30-day Sun/Earth visibility simulation, LOLA terrain-derived horizons and a first-person surface walker, for learners and mission-planning professionals.

> **Screening tool only.** Results are approximate and must not be used for landing safety or real mission planning. See [Accuracy and limitations](#accuracy-and-limitations).

## Features

| Area | Capability |
| --- | --- |
| **Site catalogue** | 13 built-in sites: south-pole rims (Shackleton, Malapert, Haworth, Nobile), CLPS targets (IM-2, IM-3, Blue Ghost), Apollo 11/12/15/16/17 and a high-resolution Shackleton NAC DTM test site |
| **Interactive 3D Moon** | Drag to rotate, click the surface to pick a custom exploration point (temporary, not persisted) and save locations to local storage |
| **Visibility simulation** | 720-hour (30-day) hourly Sun and Earth elevation/azimuth from an analytical lunar ephemeris, with Sun/Earth/both-visible percentages and longest dark period |
| **Terrain horizon** | 360-azimuth horizon computed from the LOLA 128 ppd DEM; automatic fallback to a spherical horizon when terrain tiles are unavailable |
| **JPL Horizons validation** | Compares the analytical ephemeris against NASA JPL Horizons for the selected site |
| **Decision tools** | Site comparison, mission site recommender, operating-window finder (next 12 months), mission risk assessment and printable mission report |
| **Surface walker** | First-person walk over DEM terrain (Apollo-like gait or fast explorer mode) |
| **Mission flight** | Earth-to-Moon transfer visualisation with launch-instant selection and landing sequence |
| **Professional view** | Mission tools, mission manifest and curated NASA resources |

## Quick start

Requirements: Docker with Compose, and a WebGL2-capable browser with outbound internet access for the NASA proxies.

```bash
make up
```

Open <http://localhost:8080>.

```bash
make logs
make down
```

Without `make`:

```bash
docker compose up --build -d
```

The application is fully static; any web server works as long as it provides the two proxy routes described below.

## Architecture

```
Browser (ES modules + three.js r160)
   │
   ├── static files ─────────────► nginx:alpine  (/usr/share/nginx/html)
   ├── /trek/*     ──(cached)────► trek.nasa.gov/tiles/Moon/EQ/
   └── /horizons   ──────────────► ssd.jpl.nasa.gov/api/horizons.api
```

`nginx.conf` proxies NASA services to avoid CORS restrictions and caches Moon Trek tiles for 30 days (up to 2 GB) in `/var/cache/nginx/trek`.

| Route | Upstream | Purpose |
| --- | --- | --- |
| `/trek/<layer>/1.0.0/default/default028mm/<z>/<y>/<x>.<ext>` | NASA Moon Trek WMTS | LRO WAC mosaic (303 ppd) and LOLA DEM (128 ppd) tiles |
| `/horizons?...` | JPL Horizons API | Reference Sun and Earth topocentric ephemerides |

## Project structure

```
.
├── Dockerfile
├── docker-compose.yml        Maps host port 8080 to container port 80
├── Makefile                  up / down / logs
├── nginx.conf                Static hosting, Moon Trek cache, Horizons proxy
└── web/
    ├── index.html            Application shell, styles and main UI logic
    ├── ephemeris.js          Analytical lunar ephemeris (classic script, global functions)
    ├── profiles.js           Profile selection, landing and flight orchestration (classic script)
    ├── astro.js              Orbital and Earth-orientation helpers
    ├── bodies.js             Earth and Moon meshes, shaders, textures, star field
    ├── moon.js               Interactive 3D Moon, cube-map tiles, surface picking
    ├── horizon.js            DEM tile loading and 360° terrain horizon computation
    ├── dem.js                DEM constants (radius, elevation range)
    ├── surface.js            First-person terrain viewer
    ├── walker.js             Height grid and walker physics
    ├── landing.js            Landing scene
    ├── flight.js             Earth-to-Moon flight scene
    ├── explore.js            Legacy tourism explorer (unused, not wired into the UI)
    ├── data/                 Datasets and NAC DTM raster
    ├── assets/               Textures, base and venue imagery
    └── vendor/               three.js (MIT)
```

## Technical notes

- **Ephemeris:** truncated Meeus-style series for the Moon and Sun with optical libration; displayed as "Meeus (approx.)" and verifiable against JPL Horizons from the UI.
- **Terrain horizon:** rays start at 100 m and step 250 m out to 200 km at 1° azimuth resolution. Negative horizon angles are preserved, the observer height is the site DEM elevation, and any missing DEM sample raises an error that triggers the spherical fallback instead of presenting a partial profile as complete.
- **DEM decoding:** 8-bit red channel, value `0` is no-data, `1…255` maps linearly to −9130 m … 10780 m at zoom level 5.
- **Persistence:** user-saved locations are stored in `localStorage` under `orbitpass.savedSites.v1` (maximum 100, validated on load).

## Accuracy and limitations

- The ephemeris is analytical and approximate; use the Horizons validation for reference.
- The DEM raster has a nominal resolution of about 0.67 km, so obstacles on the order of 100 m cannot be resolved even though rays are sampled at 100 m.
- PNG red-channel encoding and georeferencing have not been independently validated against the Moon Trek source. Terrain results are not scientifically verified.
- Terrain computation may be slow or fail when tiles are unavailable; the interface then reports the fallback horizon.
- Browser/WebGL integration has not been covered by automated tests.

## Data sources and credits

- NASA Moon Trek: LRO WAC mosaic and LOLA global DEM
- NASA JPL Horizons System
- LROC NAC DTM (Shackleton) raster
- three.js, MIT License

## License

Released under the [MIT License](LICENSE), an OSI-approved open-source license. Third-party components keep their own licenses (three.js: MIT). NASA data and imagery remain subject to their respective NASA terms of use.
