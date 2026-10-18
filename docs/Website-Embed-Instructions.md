# Adding the Smith Bros "Get Your Free Estimate" form to the website

For the marketing agency. About ten minutes.

## What it does
Visitors click a button on the site (for example "Get Free Estimate" or "Begin Your Project") and a four-step pop-up opens: project type, the space, wood preferences, and contact details. Smith Bros receives the lead in its dashboard instantly, and the visitor gets a confirmation. On phones the pop-up slides up from the bottom of the screen.

The pop-up draws itself inside an isolated container, so the site's theme and CSS cannot change how it looks, and it cannot change the site.

## Step 1: add the script (once, site-wide)
Paste this one line in the site footer (or header):

```html
<script src="https://YOUR-APP-DOMAIN/embed.js" defer></script>
```

`YOUR-APP-DOMAIN` will be supplied by Smith Bros' developer once the system is live. Use it exactly as given.

**In WordPress:** use a plugin such as **WPCode** (Insert Headers and Footers), or your theme's "footer scripts" setting, and paste the line there. Do not paste it into a page's text editor.

## Step 2: connect the site's buttons
Make each button or link that should open the form do **one** of these:

| Option | How |
|---|---|
| Add a class | Give the button the CSS class `smithbros-open` |
| Use a link | Set the link address to `#smithbros-estimate` |
| Add an attribute | Add `data-smithbros-open` to the element |

Example: `<a href="#smithbros-estimate">Get Free Estimate</a>`

In Elementor or other builders, the link field accepts `#smithbros-estimate`, and the "CSS Classes" field accepts `smithbros-open`.

Several buttons on the same site can open the same form.

## Optional: show the form inside a page instead of a pop-up
Add this where the form should appear, in a Custom HTML block:

```html
<div id="smithbros-estimate-form"></div>
```

## What we need from the agency
1. The exact website address(es), including both the `www` and non-`www` versions if both work (for example `https://www.example.com`). Smith Bros' developer adds these to an allowed list so the form is accepted from the site.
2. Confirmation of which buttons were connected, so it can be tested together.

## Checking it works
1. Click a connected button on a phone and on a desktop. The pop-up should open.
2. Fill it in with test details and press **Request my free estimate**.
3. You should see a "Thank you" message. Tell Smith Bros so they can confirm the test lead arrived.

If nothing happens, check that the script line is on the page (view the page source and search for `embed.js`) and that the browser console has no message about the script being blocked.

Common causes on WordPress:
- **Speed or caching plugins** (for example WP Rocket, Autoptimize, LiteSpeed) that delay, combine or defer scripts. Exclude `embed.js` from delay, combine and minify settings.
- **A security plugin or Content Security Policy** that blocks scripts or fonts from other domains. Allow the Smith Bros app domain.
- **The page editor changing the code.** Use a Custom HTML block or a scripts plugin, not a paragraph block, so the quotes in the snippet are not turned into curly quotes.

## Good to know
- The form works on phones and desktops without any extra styling.
- It uses no cookies and loads nothing from third parties. Its fonts come from the Smith Bros app.
- After submitting, a **Book a free consultation** button appears automatically once Smith Bros has connected its booking calendar. Nothing on the website needs to change.
- It includes hidden spam protection. Smith Bros may later add a visible "I'm not a robot" check (Cloudflare Turnstile); if so, the script updates centrally and nothing changes on the website.
- The script updates centrally: if Smith Bros changes the form, the website picks it up automatically with no edits from the agency.
