# OneBazaar — Buy it. Sell it. Want it.

The everything-marketplace. Sellers list, buyers post want-ads, smart matching brings them together. Local + shipping + online. Live at https://infofixdeserts-max.github.io/onebazaar/

## How it works (no backend needed)
- Pure static site: `index.html` + `styles.css` + `app.js` + `config.js` + JSON data files.
- First visit seeds 24 demo listings into the browser's localStorage. Posting, offers, ratings, and tickets all work on-device and persist per browser.
- Specs autofill: start typing a product title when posting and pick a suggestion to fill the specs table (63 templates in `templates.json`).

## Connect the live OMEN backend (optional, multi-device)
1. On the OMEN, run the EverythingHub API: `python ~/everythinghub/server.py 8895`.
2. Expose it on the LAN (same WiFi) or via a tunnel.
3. On the phone or any device, open OneBazaar → You → Settings → paste the API URL → Save. Auth, listings, offers, ratings, tickets, and Premium then sync through the server.

## Payments ($2/mo Premium, real money)
1. Create a free Stripe account at stripe.com → Payment Links → create a $2/month recurring link.
2. Paste the link as `STRIPE_LINK` in `config.js`, commit, push. The Premium modal then shows a real Pay button. "I already paid" flips ad-free mode after Stripe confirms payment on your side.

## Ads (real revenue path)
- Default: rotating house promos (no network, no tracking).
- Real ads: sign up free at Google AdSense, paste the publisher ID as `ADSENSE_CLIENT` in `config.js`, push. Ad slots switch to AdSense automatically. Premium ($2/mo) hides every ad slot.

## SEO
- Semantic HTML, meta description, canonical URL, Open Graph + Twitter cards, JSON-LD WebSite schema with SearchAction, `sitemap.xml`, `robots.txt`, mobile viewport, 44px+ touch targets.

## Develop
- Edit files, open `index.html` (or serve the folder) to preview. No build step, no dependencies.
- Dark mode: auto from OS, toggle in header, remembered per device. Honors reduced-motion.

## Deploy
- Push to `main` → GitHub Pages serves it. See `.github/workflows/pages.yml` if present, else repo Settings → Pages → Deploy from branch → main → root.
