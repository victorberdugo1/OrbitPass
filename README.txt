OrbitPass lunar horizon experimental patch

1. Back up your original web/horizon.js.
2. Copy web/horizon.js from this ZIP over the same file in your project.
3. Run: node tests/test_horizon.cjs (inside this extracted patch folder).
4. Launch OrbitPass as before and check the Data status panel.

Changes:
- Rays start at 100 m rather than 3000 m (step 250 m).
- Preserve negative horizon angles.
- Use the landing-site elevation as the observer height.
- Missing DEM values cause a visible failure/fallback, not a falsely complete terrain horizon.

Limitations:
- PNG red-channel encoding and georeferencing are NOT independently validated against the Moon Trek source. Do not treat results as scientifically verified.
- Existing app catches failures and falls back to a spherical horizon. This patch may trigger that fallback more often when terrain tiles are missing.
- The raster's ~0.67 km nominal resolution cannot resolve a 100 m obstacle, even if sampled at 100 m.
- This is not a landing safety or mission planning tool.
