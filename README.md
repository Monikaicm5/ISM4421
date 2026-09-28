# FAU Weather 🦉

A weather app with Florida Atlantic University (FAU) branding, built on the free [Open-Meteo](https://open-meteo.com/) APIs. You don't need an API key or an account. It opens on the **FAU Boca Raton campus** by default.

## Features

- **Personal welcome:** a time-of-day greeting for Moniki, with a tip based on the weather (umbrella, sunscreen, hydration…)
- **Four themes** in the header menu: **System** (follows your device's light/dark setting), **Light**, **White** and **Dark**. The app remembers your choice.
- **Official FAU owl-head logo** in the header
- **Current conditions:** temperature, feels-like, humidity, wind and gusts, UV index, pressure, sunrise and sunset
- **Hourly forecast** for the next 24 hours, with the chance of rain
- **7-day forecast** with a temperature-range bar for each day
- **City search** through the Open-Meteo Geocoding API, with type-ahead and keyboard navigation
- **Use my location** through the browser's geolocation
- **°F / °C toggle**
- The app remembers your last city and units in `localStorage`
- A **home button** that goes back to FAU Boca Raton
- Refreshes every 15 minutes while the tab is open
- Works on phones and desktops, in FAU Blue (`#003366`) and FAU Red (`#CC0000`)

## Project structure

```
index.html            Page markup
css/styles.css        FAU-themed styles
js/app.js             App logic (Open-Meteo forecast + geocoding)
js/theme-init.js      Applies the saved theme before the page paints
assets/fau-owl.svg    Fallback owl, used only if the official logo can't load
assets/favicon.svg    Browser tab icon
netlify.toml          Netlify config (publish dir + security headers)
```

This is plain HTML, CSS and JavaScript. There's **no build step and there are no dependencies**.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy to Netlify

`netlify.toml` already sets the publish directory to the repository root and turns off the build command. Pick any of these options:

### Option A: Connect the GitHub repo (recommended)
1. Go to <https://app.netlify.com> → **Add new site** → **Import an existing project**.
2. Choose **GitHub** and select this repository and branch.
3. Leave **Build command** empty and set **Publish directory** to `.`. Netlify reads both from `netlify.toml`.
4. Click **Deploy**. Every later push to that branch redeploys the site automatically.

### Option B: Drag and drop
1. Go to <https://app.netlify.com/drop>.
2. Drag this project folder onto the page. Your site is live.

### Option C: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir .
```

## The logo

The header and the welcome banner show FAU's official owl-head logo. The browser loads it from `https://www.fau.edu/images/homepage/owlhead-logo.png`, and `netlify.toml` allows that host in the Content-Security-Policy. If that image ever fails to load, the app switches to the local `assets/fau-owl.svg` automatically.

To host the official logo yourself instead, save it as `assets/fau-owl.png`. Then point both `<img class="fau-owl">` tags in `index.html` at that file.

## Personalizing

To change the name in the welcome message, edit `USER_NAME` near the top of `js/app.js`.

## Changing the default location

Edit `DEFAULT_LOCATION` near the top of `js/app.js`:

```js
const DEFAULT_LOCATION = {
  name: "Boca Raton",
  region: "Florida, United States",
  detail: "FAU Boca Raton Campus",
  latitude: 26.3705,
  longitude: -80.1024,
};
```

## Credits

- Weather data: [Open-Meteo.com](https://open-meteo.com/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- This is a student project for ISM 4421. It is not affiliated with or endorsed by Florida Atlantic University.
