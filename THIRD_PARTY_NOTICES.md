# Third-party notices and data terms

Volcanic Time is by Eric C.P. Breard (University of Edinburgh). The MIT licence in `LICENSE` covers the application code only. Everything below keeps its own terms. Licence names are quoted from the licence files shipped in this repository unless marked otherwise.

## Eruption and volcano data (not MIT)

| Item | Detail |
|---|---|
| Files | `data.js` (compact extract of the catalogue) |
| Source | Smithsonian Institution, Global Volcanism Program (GVP), Volcanoes of the World (VOTW) |
| Versions used | Eruption list: VOTW 5.3.5 (`GVP_Eruption_List_Holocene_20260424.xlsx`). Volcano list: VOTW 5.4.0 (`GVP_Volcano_List_Holocene_202609271912.xls`) |
| Records | 9,918 eruption records, 1,214 volcanoes, 7 records without coordinates |
| Terms | Smithsonian terms of use, https://volcano.si.edu/gvp_termsofuse.cfm : fair use, cite the author and source, keep credits and notices, and no commercial use of the content. There is no open licence such as Creative Commons. |

Citation (format given by GVP for v. 5.4.0):
Global Volcanism Program, 2026. [Database] Volcanoes of the World (v. 5.4.0; 7 Aug 2026). Distributed by Smithsonian Institution, compiled by Venzke, E. https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4

Any reuse of `data.js` must follow the Smithsonian terms above, not the MIT licence. This app is an independent visualization and is not endorsed by the Smithsonian Institution.

## Audio

| Files | Source | Licence |
|---|---|---|
| `assets/sonification/*.wav` drums and cymbals (kick, snare, side-stick, closed-hat, rack-tom, floor-tom, ride, crash, china) | Salamander Drumkit by Alexander Holm (Rytmenpinne), https://rytmenpinne.wordpress.com/sounds-and-such/salamander-drumkit | Creative Commons Attribution-ShareAlike 3.0 Unported. Full text: `assets/sonification/Salamander-LICENSE.txt`. The samples here are adapted (mono downmix, silence trimming, short faded tails, level calibration), so these adapted files stay under CC BY-SA 3.0. |
| `assets/sonification/piano-*.wav` | VSCO 2 Community Edition, https://github.com/sgossner/VSCO-2-CE, recorded by Sam Gossner and Simon Dalzell, sample cutting by Elan Hickler / Soundemote | CC0 1.0 (as stated in the source and in the app's About text) |

## Libraries and fonts (vendored)

| Files | Project | Licence and notice |
|---|---|---|
| `vendor/tone/Tone.js` | Tone.js, https://tonejs.github.io/ | MIT. `vendor/tone/LICENSE.md` reads "Copyright (c) 2014-2020 Yotam Mann"; the file header says 2014-2024. |
| `vendor/gifenc/*` | gifenc, https://github.com/mattdesl/gifenc | MIT, "Copyright (c) 2017 Matt DesLauriers". See `vendor/gifenc/LICENSE.md`. |
| `vendor/lucide/*` | Lucide icons, https://lucide.dev | ISC, "Copyright (c) 2026 Lucide Icons and Contributors". See `vendor/lucide/LICENSE`. |
| `fonts/SpaceGrotesk-*.woff2` | Space Grotesk, https://github.com/floriankarsten/space-grotesk | SIL Open Font License 1.1, "Copyright 2020 The Space Grotesk Project Authors". Full text: `fonts/OFL.txt`. Both files are the same variable font (weights 300 to 700). |

## Map and relief data

| Item | Source | Terms |
|---|---|---|
| `earth-relief.webp` with `relief.json` | "Fatiando a Terra Data: Earth - Topography grid at 10 arc-minute resolution", Uieda, L. (University of Liverpool), https://doi.org/10.5281/zenodo.5882203 , derived from ETOPO1 via the ICGEM calculation service, then shaded and resampled for display. ETOPO1: Amante, C. and Eakins, B.W., 2009, NOAA Technical Memorandum NESDIS NGDC-24. | Creative Commons Attribution 4.0 International (Zenodo record). The record states the source ETOPO1 licence as public domain and asks users to cite the original authors. |
| Tectonic plate boundaries (loaded at run time, not stored here) | PB2002 model, Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems, 4(3), 1027, https://doi.org/10.1029/2001GC000252 . Fetched from https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json (Hugo Ahlenius, Nordpil) | Open Data Commons Attribution License 1.0, as stated by the fraxen/tectonicplates repository, which asks for credit to Hugo Ahlenius, Nordpil and Peter Bird. |
| `world.geojson` (country outlines, 177 features with ISO 3166-1 alpha-3 ids) | UNVERIFIED. The build scripts do not record where this file came from. It resembles the widely shared `world.geo.json` country set (github.com/johan/world.geo.json), whose own README says "Legal status of this dataset: dubious?". If this is that dataset, its provenance is unclear. Planned fix: replace it with Natural Earth country outlines (public domain). | Not confirmed. |

## Method reference

Volcanic Explosivity Index: Newhall, C.G. and Self, S., 1982, The volcanic explosivity index (VEI): An estimate of explosive magnitude for historical volcanism, Journal of Geophysical Research, 87(C2), 1231-1238, https://doi.org/10.1029/JC087iC02p01231 .

## Logo

`assets/ecpb_roundel.png` is the personal logo of Eric C.P. Breard. All rights reserved. It is not covered by the MIT licence and may not be reused without permission.
