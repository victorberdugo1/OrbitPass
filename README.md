# OrbitPass — Lunar Landing Site Navigator

OrbitPass is a browser-based lunar exploration and preliminary mission-screening application. It combines an interactive 3D Moon, an Educational Mode flight-and-landing experience, lunar surface exploration, and Pro tools for studying environmental and operational conditions at selected sites.

> **Important:** OrbitPass is an educational and preliminary screening tool. Ephemerides, terrain-derived horizons, mission schedules and risk indicators are approximate and **must not be used to certify landing safety or plan an actual mission**.

## Modes and features

### Educational Mode

- Select a launch location and a lunar destination.
- Visualize an Earth-to-Moon flight and landing sequence.
- Explore the lunar surface in an interactive 3D environment, including a first-person walker.

### Pro Mode

- Explore an interactive 3D Moon and select a site.
- Browse **12 built-in lunar sites**: Shackleton rim, Malapert, Haworth, Nobile rim, Mons Mouton (IM-2), Reiner Gamma (IM-3), Mare Crisium (Blue Ghost), and Apollo 11, 12, 15, 16 and 17.
- Open a site's **Base** page to see its photograph/concept illustration, description, coordinates, environmental conditions and temperature reference range.
- Run a **30-day simulation** (720 hourly steps) of Sun and Earth geometry and visibility, including terrain-horizon analysis when data is available.
- Inspect the **Mission Manifest**, including reported mission target periods and proximity/overlap screening.
- Use the **Operating Window Finder** to scan candidate surface-operation windows over the following 12 months.
- Run **Mission Risk Assessment** and generate a print-ready mission report (use the browser's **Save as PDF** option).
- Use **Mission Site Recommender** to compare candidate sites and suggested dates.
- Compare the approximate ephemeris with JPL Horizons when the upstream service is accessible.

The Base analysis widgets are arranged in two columns on larger screens: **30-day Simulation / Mission Manifest**, followed by **Operating Window Finder / Mission Risk Assessment**. Mission Site Recommender appears below them.

**Site imagery:** Some site images are illustrative concept art, not photographs of constructed lunar installations.

## Quick start

Requirements: Docker with Compose, a browser with WebGL2 support, and internet access for NASA/JPL proxy requests.

```bash
make up
```

Open <http://localhost:8080>.

```bash
make logs
make down
```

Or start without Make:

```bash
docker compose up --build -d
```

The application is primarily static and can be hosted by another web server if the required proxy routes are provided.

## Architecture

```text
Browser (HTML, JavaScript, three.js)
  |-- static assets ----------> nginx:alpine
  |-- /trek/* -----------------> NASA Moon Trek WMTS (cached)
  `-- /horizons -------------> NASA JPL Horizons API
```

The included `nginx.conf` serves the `web/` directory and proxies `/trek/` and `/horizons` to avoid browser CORS restrictions. Moon Trek responses are cached by NGINX.

| Route | Upstream | Purpose |
| --- | --- | --- |
| `/trek/...` | `trek.nasa.gov/tiles/Moon/EQ/` | Moon Trek imagery and terrain tiles |
| `/horizons?...` | `ssd.jpl.nasa.gov/api/horizons.api` | Reference ephemerides |

## Project structure

```text
.
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── nginx.conf
├── README.md
└── web/
    ├── index.html             # Application interface
    ├── ephemeris.js           # Lunar ephemeris
    ├── profiles.js            # Mission flow
    ├── astro.js               # Orbital helpers
    ├── bodies.js              # 3D celestial bodies
    ├── moon.js                # Interactive Moon
    ├── horizon.js             # Terrain horizon analysis
    ├── dem.js                 # Elevation data utilities
    ├── surface.js             # Surface exploration
    ├── walker.js              # First-person navigation
    ├── landing.js             # Landing sequence
    ├── flight.js              # Flight sequence
    ├── data/                  # Application datasets
    ├── assets/                # Images and textures
    └── vendor/                # Third-party libraries
```

## Technical notes and limitations

- The 30-day calculation uses **720 hourly steps** and an approximate analytical ephemeris. JPL Horizons can provide a reference comparison; this does not turn the simulation into a certified navigation product.
- Terrain horizons use LOLA-derived DEM tiles when available. Missing tiles may trigger a spherical-horizon fallback.
- The source DEM encoding, georeferencing and effective resolution have not been independently validated for operational use. Small obstacles and local thermal conditions may not be represented.
- The displayed **−233 °C (night) / +127 °C (day)** temperature range is a **static, general lunar reference**, not a location- or time-specific thermal forecast.
- Mission Manifest target periods are informational and may change; verify dates and sites with mission operators. Overlap/proximity indicators are not an official deconfliction service.
- Saved custom locations use browser `localStorage` (`orbitpass.savedSites.v1`). They are local to that browser/profile.
- Browser/WebGL behavior and end-to-end UI flows have not been comprehensively covered by automated tests.

## Data sources and credits

- [NASA Moon Trek](https://trek.nasa.gov/) — lunar imagery and terrain tiles
- [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) — reference ephemerides
- [three.js](https://threejs.org/) — 3D rendering library (MIT license)

NASA data and imagery remain subject to applicable provider terms. Generated concept illustrations should not be presented as real photographs.

## "Two Baldies problem" team

- **Victor Berdugo** — [victorberdugo1@gmail.com](mailto:victorberdugo1@gmail.com)
- **Pavel Doltu** — [paveldoltu@gmail.com](mailto:paveldoltu@gmail.com)
