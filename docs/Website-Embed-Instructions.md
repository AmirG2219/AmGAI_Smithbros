# Adding the Smith Bros estimate form to the website

For the marketing agency. This takes about five minutes.

## What it does
It shows a "Request a free estimate" form on the page. When a visitor submits it, Smith Bros receives the lead in its dashboard and the visitor gets a confirmation. The form draws itself inside an isolated container, so the site's theme and CSS cannot change how it looks, and it cannot change the site.

## The code
Paste this where the form should appear:

```html
<div id="smithbros-estimate-form"></div>
<script src="https://YOUR-APP-DOMAIN/embed.js" defer></script>
```

`YOUR-APP-DOMAIN` will be supplied by Smith Bros' developer once the system is live. Use it exactly as given.

## How to add it in WordPress
Use whichever matches how the site is built:

- **Block editor (Gutenberg):** add a **Custom HTML** block on the page and paste both lines.
- **Elementor:** add an **HTML** widget and paste both lines.
- **Other page builders:** use the "HTML" or "Code" element.
- **Script gets stripped?** Some security plugins remove `<script>` tags from page content. In that case use a plugin such as **WPCode** to insert the snippet on that specific page, or add the `<script>` line to the theme footer and keep only the `<div>` in the page.

Place it once per page. Leave the `id` as `smithbros-estimate-form`.

## What visitors see
1. The "Request a free estimate" form.
2. After they submit: a thank-you message and, once Smith Bros has connected its booking calendar, a **Book a free consultation** button. The button appears automatically; nothing on the website needs to change.

## What we need from the agency
1. The exact website address(es) the form will appear on, including both the `www` and non-`www` versions if both work (for example `https://www.example.com`). Smith Bros' developer adds these to an allowed list so the form is accepted from the site.
2. Confirmation of which page it was placed on, so it can be tested together.

## Checking it works
1. Open the page on a phone and on a desktop.
2. Fill in the form with test details and press **Get my estimate**.
3. You should see a "Thank you" message. Tell Smith Bros so they can confirm the test lead arrived.

If the form doesn't appear, check that the `<div>` and the `<script>` are both on the page, and that the browser console has no message about the script being blocked.

Common causes on WordPress:
- **Speed or caching plugins** (for example WP Rocket, Autoptimize, LiteSpeed) that delay, combine or defer scripts. Exclude `embed.js` from delay, combine and minify settings.
- **A security plugin or Content Security Policy** that blocks scripts from other domains. Allow the Smith Bros app domain.
- **Page editor changing the code.** Use a Custom HTML block rather than a text or paragraph block, so the quotes in the snippet are not turned into curly quotes.

## Good to know
- The form works on phones and desktops without any extra styling.
- It does not use cookies or load anything from third parties.
- It includes hidden spam protection. Smith Bros may later add a visible "I'm not a robot" check (Cloudflare Turnstile); if so, the script is updated centrally and nothing changes on the website.
- The script updates centrally: if Smith Bros changes the form, the website picks it up automatically with no edits from the agency.
