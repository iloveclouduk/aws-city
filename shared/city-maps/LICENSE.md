# Map data licence

The files in this folder (`<region>.json`) are street plans derived from [OpenStreetMap](https://www.openstreetmap.org)
data: streets, water, parks and building density round each Region's city centre, snapped to the game's tile grid by
`npm run city-maps` (`scripts/fetch-city-maps.mjs`, `scripts/citymap/`).

**© OpenStreetMap contributors.** The data is available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/); see
[openstreetmap.org/copyright](https://www.openstreetmap.org/copyright). These derived plans are a Derivative Database
and are licensed under the ODbL 1.0 too. Each file names its source (`source`, the Overpass API endpoint) and the day
it was read (`fetched`), and carries `"attribution": "© OpenStreetMap contributors"` and `"licence": "ODbL-1.0"`.

The game shows the attribution wherever these maps are drawn. The code that builds and draws them is MIT (the
repository's `LICENSE`); only the map data in this folder is ODbL.

The centres (`shared/city-centres.json`) are each Region's named city downtown, chosen by us and linked to the
OpenStreetMap feature they sit on. They say nothing about where AWS data centres are.
