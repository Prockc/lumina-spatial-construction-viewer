# Lumina Spatial Construction Viewer

White-labeled 3D Gaussian Splatting web viewer for **Lumina Spatial LLC**.
Streams `.lcc2` captures from Amazon S3 via the XGrids LCC-Web-SDK, rendered
with Three.js, locked to first-person navigation, and deployed on AWS Amplify
Hosting.

## How it works

One hosted viewer serves every capture. The model is chosen per page view by
URL parameter:

```
https://<amplify-domain>/?model=site-42          ->  {S3_BUCKET}/site-42.lcc2
https://<amplify-domain>/?model=jobs/site-42     ->  {S3_BUCKET}/jobs/site-42.lcc2
https://<amplify-domain>/?src=https://.../x.lcc2 ->  loaded verbatim (HTTPS only)
```

## Local development

```bash
npm install
cp .env.example .env      # fill in VITE_S3_BUCKET_URL (+ optional app key)
npm run dev               # http://localhost:5173/?model=<your-model>
```

`npm run build` typechecks and produces the production bundle in `dist/`.

## Configuration (build-time env vars)

| Variable | Purpose |
| --- | --- |
| `VITE_S3_BUCKET_URL` | Base URL of the S3 bucket holding the `.lcc2` files (no trailing slash). |
| `VITE_XGRIDS_APP_KEY` | XGrids developer app key. Licenses the SDK and removes the XGrids GL watermark. Get one at <https://developer.xgrids.com>. |
| `VITE_DEFAULT_MODEL` | Optional model loaded when no `?model=` parameter is present. |

Set these in the Amplify console (App settings → Environment variables) for
deployed builds.

## AWS deployment

### 1. S3 bucket CORS

Apply [s3-cors-policy.json](s3-cors-policy.json) to the model bucket so the
Amplify-hosted viewer can range-request the `.lcc2` tiles:

```bash
aws s3api put-bucket-cors --bucket <bucket-name> \
  --cors-configuration "{\"CORSRules\": $(cat s3-cors-policy.json)}"
```

If the viewer will run on a custom domain, add it to `AllowedOrigins`.
Objects only need to be readable by the viewer (public-read objects or a
CloudFront distribution in front of the bucket both work).

### 2. Amplify app

[scripts/setup-amplify-app.sh](scripts/setup-amplify-app.sh) provisions the
Amplify Hosting app named exactly **Lumina Spatial Construction Viewer**,
applies the SPA rewrite rules from
[amplify-rewrites.json](amplify-rewrites.json), and sets the env vars:

```bash
./scripts/setup-amplify-app.sh <git-repo-url> <s3-bucket-url> [xgrids-app-key]
```

Builds are driven by [amplify.yml](amplify.yml) (Node 20, `npm ci`,
`npm run build`, artifacts from `dist/`). The SPA rewrite serves
`index.html` with a 200 for every non-asset path, so `?model=` deep links
never 404. Query strings pass through Amplify rewrites untouched.

## White-labeling

- The SDK's built-in loading effect is disabled; all loading UI is the
  Lumina-branded loader (`#DB146B`) in `src/ui/LoadingScreen.ts`.
- `src/ui/brandGuard.ts` runs a `MutationObserver` that suppresses any DOM
  node matching XGrids/LCC branding signatures before it can paint, backed
  by `display:none !important` CSS kill-rules inlined in `index.html`.
- The XGrids **GL watermark** is part of the SDK's licensing and is rendered
  inside WebGL, not the DOM. Supplying a valid `VITE_XGRIDS_APP_KEY` removes
  it legitimately — this is the supported white-label path.

## Navigation

Strictly first-person; no orbit/third-person mode exists in the build.

- **Desktop:** drag to look, `WASD`/arrows to move, `Q`/`E` down/up,
  `Shift` to sprint.
- **Mobile:** dual brand-tinted joysticks (nipplejs) — left stick =
  forward/backward/strafe, right stick = look (yaw/pitch). Touch input on
  the sticks and canvas is fully isolated from browser scrolling and
  pull-to-refresh.

## Project layout

```
src/
  main.ts                      entry point and wiring
  config.ts                    env config + ?model= URL resolution
  viewer/Viewer.ts             scene/camera/renderer + LCC streaming loader
  viewer/FirstPersonController.ts  first-person camera (desktop + joystick inputs)
  ui/LoadingScreen.ts          Lumina-branded loading overlay
  ui/brandGuard.ts             MutationObserver white-label enforcement
  ui/joystick.ts               nipplejs dual-stick mobile controls
  vendor/lcc/                  XGrids LCC-Web-SDK v0.6.0 (vendored) + typings
amplify.yml                    Amplify build spec
amplify-rewrites.json          SPA rewrite rules (applied by setup script)
s3-cors-policy.json            CORS config for the model bucket
scripts/setup-amplify-app.sh   one-time Amplify provisioning
```
