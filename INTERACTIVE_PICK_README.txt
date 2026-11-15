OrbitPass — interactive Moon surface selection

Open a location, expand the 3D Moon, and click the surface to choose an exploration point.
Drag to rotate; a drag does not select a location. The selected location appears as a green marker.
The application immediately computes approximate 30-day Sun/Earth metrics and then attempts
LOLA terrain horizon calculation. While terrain loads, it uses a spherical horizon fallback.
Use "Back to saved sites" to return to the original Shackleton rim location.

No manual coordinate input is added. Existing 12 sites remain unchanged.
The custom point is temporary (not saved between reloads).

Known limits: Terrain computation may be slow or fail when tiles are missing; in that case
results remain approximate and must not be used for real mission planning.
Static JavaScript syntax checked; browser/WebGL integration not tested in this environment.
