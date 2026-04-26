# PourCheck™ 🏗️

**Concrete Pour Weather Intelligence** — Should you pour today?

Enter your jobsite location and instantly get a pour quality score based on real-time weather conditions. Built tough for the construction crew.

![PourCheck Screenshot](https://img.shields.io/badge/BUILT-TOUGH-FEBD17?style=for-the-badge&labelColor=1A1A1A)

## Features

- **Pour Quality Score** — 0-100 score based on temperature, humidity, wind, precipitation, and dew point analysis
- **Risk Assessment** — Detailed warnings about weather conditions that could damage fresh concrete
- **Hourly Breakdown** — See conditions hour-by-hour to find the best pour window
- **Pro Tips** — Context-aware concrete placement advice based on current conditions
- **Location Search** — City, zip code, address, or GPS geolocation
- **No API Key Required** — Uses free Open-Meteo weather API and OpenStreetMap geocoding

## How It Works

The pour quality algorithm evaluates 6 weather factors against concrete industry best practices (ACI 305/306):

| Factor | Ideal Range | Weight |
|--------|------------|--------|
| Temperature | 50–85°F | 25% |
| Humidity | 40–70% | 20% |
| Wind Speed | < 15 mph | 15% |
| Rain Probability | < 20% (next 8hr) | 30% |
| Precipitation | None | 10% |
| Dew Point Spread | > 10°F from temp | Bonus |

### Verdict Scale

| Score | Verdict | Meaning |
|-------|---------|---------|
| 85–100 | 🟢 POUR IT | Excellent conditions |
| 70–84 | 👍 GOOD TO GO | Favorable with minor concerns |
| 50–69 | ⚠️ PROCEED WITH CAUTION | Marginal — extra precautions needed |
| 30–49 | 🔶 HIGH RISK | Multiple adverse factors |
| 0–29 | 🛑 DO NOT POUR | Conditions too dangerous |

## Tech Stack

- **Vanilla HTML/CSS/JS** — No frameworks, instant load
- **Open-Meteo API** — Free weather data, no key required
- **OpenStreetMap Nominatim** — Free geocoding
- **Google Fonts** — Oswald + Inter for that industrial look

## Development

Just open `index.html` in a browser. No build step needed.

```bash
# Clone and open
git clone https://github.com/MisahSnow/pour-check.git
cd pour-check
open index.html
```

## Disclaimer

PourCheck is a weather assessment tool, not a substitute for on-site testing or professional engineering judgment. Always consult your concrete supplier and follow ACI guidelines for your specific mix design and placement requirements.
