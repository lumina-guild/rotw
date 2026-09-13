# Guild Manager

Static Guild Management website ready for GitHub Pages.

## Files
- `index.html` — main website
- `styles.css` — styling
- `app.js` — member and raid-party logic
- `resources/` — Ragnarok job icons
- `.nojekyll` — tells GitHub Pages to serve the static files directly

## Publish with GitHub Pages
1. Create a new GitHub repository.
2. Upload **the contents of this folder to the repository root**.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your main branch (usually `main`) and folder `/ (root)`.
6. Save and wait for GitHub Pages to publish the site.

## Data storage
The current build uses browser `localStorage`. That means the site is publicly accessible through GitHub Pages, but each browser/device has its own saved guild data.

Use **Export JSON** / **Import JSON** to move or back up data between browsers. A shared live guild database for multiple Guild Leaders/Officers would require a backend such as Supabase.
