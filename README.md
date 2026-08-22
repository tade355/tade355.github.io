# Sun, Earth & Moon Explorer

**An interactive astronomical simulation of day, night, the seasons, the phases of the Moon, and the sky as seen from anywhere on Earth.**

Live at: **https://tade355.github.io/sun-earth-moon.html**

---

## Foreword

Long before almanacs, satellites, or software, people told time by watching the sky. A farmer knew the planting season by where the Sun rose. A sailor found north by the pole star. A fisherman in Lagos and a shepherd in Svalbard lived, without ever meeting, under the same two lights — one that gave them day and warmth, and one that quietly changed shape every night and pulled the tides beneath their boats.

This project is an attempt to hand that same intuition back to anyone with a browser. Not a photograph of the sky, and not a lecture about it, but something you can *turn* — drag a slider and watch a year pass in seconds; pick a city on the far side of the world and see, instantly, whether the Moon is up over their heads right now; ask "why don't we get an eclipse every month?" and watch the answer trace itself out as a thin line crossing a plane.

Everything on this page is computed, not looked up. There is no external weather API, no ephemeris database, no server. A single self-contained file works out, from first principles of orbital geometry, what the sky is doing at any place, on any day, at any hour — including *this* hour, at *your* actual coordinates, if you let it use them. Where the underlying reality is genuinely too complex for a single page to model exactly (the Moon's true orbital tilt, real atmospheric weather, the equation of time), it says so plainly rather than pretending to a precision it doesn't have.

It was built, tested, and corrected in the open — including two real bugs a curious user caught by simply comparing the app to the Moon they could see outside their own window, which is exactly the kind of scrutiny a tool like this should invite.

---

## What it is

A single HTML page, `sun-earth-moon.html`, that simulates the Sun–Earth–Moon system well enough to teach and demonstrate:

- **Day and night** — Earth's rotation and the terminator line between the lit and dark hemispheres.
- **The seasons** — Earth's fixed 23.4° axial tilt and its orbit around the Sun, and why that (not distance from the Sun) causes summer and winter.
- **Sunrise, sunset, and day length** — computed from real solar-declination geometry for any latitude and time of year, including polar day/night.
- **The phases of the Moon** — derived live from the actual Sun–Earth–Moon angle in the simulation, not a lookup table, so the ~29.5-day cycle emerges naturally from the Moon's ~27.3-day orbit.
- **The Moon's visibility from a real place** — altitude, moonrise, and moonset for a chosen location and moment, plus its orbital distance (supermoon/micromoon), tidal strength (spring/neap), and whether conditions align for an eclipse.
- **A simulated local climate** — an illustrative, clearly-labeled estimate of temperature, wind, and rain chance from latitude, season, and time of day (not a real forecast).

## Why it exists

Most explanations of "why we have seasons" or "why the Moon has phases" are either a static diagram (which can't show motion) or a real-time planetarium app (which can't show a whole year in ten seconds, and doesn't explain its own math). This page tries to sit between the two: fast enough to explore, honest enough to show its work.

## Features

**One shared clock drives everything.** Scrub the *Day of year* and *Time of day* sliders, or press Play, and every panel — the orbital diagram, the spinning globe, the Moon phase, the sky view, the climate estimate — updates together from the same simulated moment.

| Feature | What it does |
|---|---|
| Orbital view | Top-down diagram of Earth orbiting the Sun with the Moon orbiting Earth; marks the equinoxes and solstices and Earth's fixed axial tilt. |
| Day & Night globe | A spinning globe with a live terminator line, latitude grid, and an observer marker showing sunrise, sunset, and day length. |
| Named locations | Twenty real cities across every inhabited climate band, grouped by conditions rather than hemisphere, each with a real IANA timezone. |
| Moon phase | Live-rendered crescent/gibbous shape, illumination percentage, orbital distance (supermoon/micromoon), tide strength, and an eclipse-conditions watch driven by a lunar nodal-regression model. |
| Sky view | A horizon panel showing exactly when and how high the Moon rises for the selected place and moment, with a sky color that shifts through day, twilight, and night. |
| Simulated climate | Temperature, wind, and rain-chance estimate blending a latitude-based climate model with per-city real-world flavor (e.g. Nairobi's highland cooling, Tehran's aridity). |
| Jump to now / Use my location | Reads the device clock (and, on request, GPS) to show what's really happening in the sky, right now, wherever you are. |
| Real-time playback | A speed setting that advances the simulation at exactly the pace of reality — one second per second. |
| Shareable permalinks | Encodes the exact date, time, location, and units into a URL that reproduces the same view for anyone who opens it. |
| Quiz mode | Randomized phase-identification, season, and day/night questions with a running score. |
| Guided tour | A first-visit walkthrough of every panel, replayable at any time. |

## How it works

The simulation runs on one continuous variable, `t`: days elapsed since a fixed reference epoch (2000-01-01). Three quantities are derived from it:

- **Earth's orbital angle** cycles once per 365.25 days, giving the Sun's declination (and therefore the season) via `declination = 23.44° × cos(orbital angle − June-solstice phase)`.
- **The Moon's orbital angle** cycles once per 27.32 days (its real sidereal period). The angle *between* the Moon's and Earth's positions — the elongation — is what the Sun actually illuminates as seen from Earth, and it was calibrated once against a known real new moon (2000-01-06) so that "now" shows the Moon's actual real-world phase, not an arbitrary one.
- **An observer's position** on the rotating, tilted Earth, combined with the Sun's or Moon's declination and hour angle, gives sunrise/sunset, moonrise/moonset, and altitude — standard spherical-astronomy formulas, applied live.

Supporting models layer on top of that core: the Moon's elliptical orbit (for supermoon/apogee detection), a slow regression of its orbital nodes (for the eclipse-conditions watch — the real reason eclipses are rare rather than monthly), and spring/neap tide strength from the Sun–Moon angle.

Where the site displays a *real* date — via "Jump to now," GPS location, or picking a named city (which computes that city's actual current time in its real timezone) — dates are derived from genuine calendar arithmetic (`Date` objects), not the simulation's simplified 365.25-day cycle, so they stay correct across real leap years indefinitely.

## Known simplifications

Stated plainly, in the app itself and here:

- The Moon's orbit is treated as coplanar with Earth's orbit around the Sun (its real ~5.14° inclination is modeled only for the eclipse-node calculation).
- Sunrise/sunset ignore atmospheric refraction and the equation of time.
- The simulated climate is an illustrative model based on latitude, season, and per-city adjustments — not a live weather forecast.
- Distances and sizes in the orbital diagram are not to scale (nothing about the real solar system fits legibly on one screen).

## Project structure

```
sun-earth-moon.html   The entire application: markup, styling, and logic in one
                       self-contained file. No build step, no dependencies, no
                       external services — open it in a browser and it runs.
```

## Running it locally

```bash
git clone https://github.com/tade355/tade355.github.io.git
cd tade355.github.io
python3 -m http.server 8000
# then open http://localhost:8000/sun-earth-moon.html
```

Or simply open the file directly in a browser. Geolocation ("Use my location & time") requires either `localhost` or a real HTTPS origin — it will not work from a `file://` path or an embedded/sandboxed preview.

## Author & Copyright

**Oluwatade Dada**, for **Fortuity Glee Consult**
Abuja, Nigeria

Copyright © 2026 Oluwatade Dada / Fortuity Glee Consult. All rights reserved.

No part of this software may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the copyright holder, except for personal, non-commercial viewing via the published site.

---

*Fortuity Glee Consult — Innovate. Build. Deliver.*
https://tade355.github.io
