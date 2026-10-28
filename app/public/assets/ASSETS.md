# Ladle asset library (v20 game hall)

Everything the game-hall scene can use: a hero drum, mascot characters, two dozen animated
animal avatars, room dressing (stage, curtains, chandeliers, lamps, spotlights, sofas, plants,
rugs, columns), one warm interior HDRI pair and three tileable materials.

- `models/<pack>/*.glb`: optimized, ready to load. Every file is meshopt-compressed
  (`EXT_meshopt_compression`, `KHR_mesh_quantization`) with WebP textures (`EXT_texture_webp`),
  textures embedded. drei's `useGLTF(url)` decodes meshopt by default; with plain three use
  `GLTFLoader().setMeshoptDecoder(MeshoptDecoder)` from `three/examples/jsm/libs/meshopt_decoder.module.js`.
  Largest file: 806 KB (the hero drum). Target was < 1.5 MB per model.
- `manifest.json`: one entry per optimized model (file, bytes, triangles, skinned, animation clip
  names, author, license, source). Generated, do not hand-edit.
- `hdri/*.hdr`: 1k equirect HDRIs (load with `HDRLoader` from `three/examples/jsm/loaders/HDRLoader.js`).
- `textures/<id>/*.webp`: 1024 px colour, OpenGL normal, roughness maps.
- `art/*.webp`: 2D Higgsfield images (mascot line-up, bear front, drum concepts) for the
  loading screen, posters or profile art.
- `app/.assets-staging/` (was `public/assets/_staging/`): raw downloads and raw Higgsfield outputs,
  kept for re-optimizing, out of `public/` and git-ignored since v20.
- Contact sheets: `app/screenshots/v20/assets/*.png`, rendered by the dev-only page
  `/art/assets?set=<pack,pack>&cols=6&tile=210` (app/app/art/assets, 404 in production).

Orientation: every character faces +Z (the three.js default "front"). The three Tripo mascots
were rotated -90 degrees about Y before optimizing (Tripo outputs face +X). Units: Kenney and
Poly Pizza files are in their authors' units (about 1 unit = 1 m for furniture, characters
about 0.5 to 1.8); Higgsfield files are normalized to about 1 to 2 units tall. Scale on load.

## Safety and licensing policy followed

- Sources used, and nothing else: kenney.nl (CC0 packs), poly.pizza (CC0 items only; each item's
  licence was read from its page before download, CC-BY items were skipped), polyhaven.com (CC0
  HDRIs, via api.polyhaven.com and dl.polyhaven.org), ambientcg.com (CC0 materials, served by its
  own download host acg-download.struffelproductions.com), and generations from the user's own
  Higgsfield account. No mirrors, no link shorteners, no Sketchfab downloads this round.
- File types kept: .glb, .png, .jpg (converted to .webp), .hdr, .txt. Every .zip was listed
  first and only those types were extracted by explicit path (`unzip -j` with named members).
  Skipped from the archives: .fbx, .obj/.mtl, .dae, .stl, .blend, .usdc, .mtlx, .tres, .url,
  .html. Nothing was executed from any download. Every GLB starts with the `glTF` magic header.
- Honesty rules applied to the picks: from Kenney Mini Arcade the `gambling-machine` (a slot
  machine), `prize-wheel`, `cash-register`, `claw-machine`, `prizes` and `ticket-machine`
  models were deliberately NOT extracted (no slot machines, no prize or money imagery). No coins,
  chips or money props anywhere. Higgsfield prompts all carried "no coins, no cards, no chips,
  no text".
- CC0 needs no attribution, but credit is kind: "3D assets by Kenney (kenney.nl), Quaternius,
  CreativeTrio, Kay Lousberg, iPoly3D and lakescorp via Poly Pizza; HDRIs by Greg Zaal, Jarod
  Guest and Oliksiy Yakovlyev via Poly Haven; materials by ambientCG."

## Higgsfield signature pieces (user's account)

| file | what | how | job id | credits |
|---|---|---|---|---:|
| `art/mascot-lineup.webp` (+ `app/.assets-staging/higgsfield/src/mascot-lineup.png`, 2688x1520) | character sheet: bear host, fox bellhop, frog crooner, cat usher | GPT Image 2 (medium, 2k) | 3e7b72e6-e37c-4630-8271-58284e296d25 | 2 |
| `art/bear-front.webp` (+ src png) | bear host, front A-pose reference | GPT Image 2 (medium, 1k) | 80d1386f-8e26-4aec-a079-c64ebb76371a | 1 |
| `models/higgsfield/bear-host-meshy-rigged-wave.glb` | bear host mascot, textured, humanoid rig (24 bones), clip `Big_Wave_Hello` (5 s) | Meshy image-to-3D + rigging + animation 28 | 994614db-4754-4a4b-80da-406334de854f | 38 |
| `models/higgsfield/fox-bellhop-tripo.glb` | fox bellhop mascot (teal jacket, pillbox hat), textured PBR, static | Tripo H3.1 image-to-3D from the line-up crop | 8c034121-1adf-425e-97a3-75545f9744dd | 12 |
| `models/higgsfield/frog-crooner-tripo.glb` | frog mascot (cream dinner jacket, tomato bow tie), textured PBR, static | Tripo H3.1 image-to-3D from the line-up crop | 4e040542-874e-441a-ab62-44135013f178 | 12 |
| `models/higgsfield/cat-usher-tripo.glb` | cat usher mascot (sky-blue jacket, brass trim), textured PBR, static | Tripo H3.1 image-to-3D from the line-up crop | e039ea4b-77d1-4af5-9ea1-c5f39e208a8b | 12 |
| `art/drum-concept.webp` (+ src png) | hero drum concept: brass and glass sphere on walnut pedestal, coloured balls | GPT Image 2 (medium, 1k) | c345c372-a7c6-4d97-99fa-4e82264fc28e | 1 |
| `models/higgsfield/drum-brass-glass-tripo.glb` | hero drum, complete (brass ribs, pedestal, crank, chute). The glass shell came out opaque pearl: use it as a static or distant centrepiece, poster object or loading-screen hero | Tripo H3.1 image-to-3D, 2048 textures kept | 658aa099-9e20-4cf4-8d95-31fc50682baa | 12 |
| `art/drum-cradle-concept.webp` (+ src png) | empty drum cradle concept | GPT Image 2 (medium, 1k) | 0185ec49-ad23-4d2e-8275-97bdb6a5fdca | 1 |
| `models/higgsfield/drum-cradle-tripo.glb` | empty brass-and-walnut cradle (arms, hubs, crank wheel, chute) to hold the app's own live glass drum (components/drum) between the hubs | Tripo H3.1 image-to-3D | f86fd795-4066-4cd8-bc2b-d374b6fd23c2 | 12 |
| `models/higgsfield/stanchion-velvet-rope-tripo.glb` | two polished brass stanchions joined by a plum velvet rope (rope runs along X, 1.00 x 0.87 x 0.30) | Tripo text-to-3D | ace3e667-662e-4400-9fa7-74bc18d90cc3 | 5 |
| `app/.assets-staging/higgsfield/ladle-emblem-v1-tomato-tripo.glb` (raw only, rejected) | first ladle emblem: the ball came out as a tomato with a stem, so it was not optimized or shipped | Tripo text-to-3D | b4e60e23-c70c-4ead-ac9f-4c39b8849660 | 5 |
| `models/higgsfield/ladle-emblem-tripo.glb` | 3D brass ladle emblem (the logo's lowercase-l ladle) holding one glossy red-orange ball, on a walnut base (0.43 x 1.00 x 0.43). For the loading screen, the Genesis badge, a trophy-shelf prop | Tripo text-to-3D (v2 prompt: billiard-like ball; negative: tomato, stem) | 56aa2966-3b56-4694-8241-14d92b648004 | 5 |

**Higgsfield credits used by this asset task: 118** (images 6, Meshy rigged mascot 38, Tripo image-to-3D
5 x 12 = 60, Tripo text-to-3D 3 x 5 = 15), checked against the account's transaction list (balance was 1571.79
before). The same list shows about 21 "GPT Image 2.0" jobs at 2 credits each (23:44 to 00:02 UTC) that this task
did not submit: another job of this run was using the account at the same time. The free plan allows one job
at a time and refuses GPT Image 2.5 ("requires basic plan"), so GPT Image 2 (1 to 2 credits) made the images.

### Integration notes for the Higgsfield pieces

- Bear (`bear-host-meshy-rigged-wave.glb`): 1.05 x 1.22 x 0.71 in the wave pose. 24-bone humanoid skin with
  Mixamo-style names (Hips, Spine, Spine01, Spine02, neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand,
  the Right mirror, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, the Right mirror). One clip is baked:
  `Armature|Big_Wave_Hello|baselayer` (5 s), a greeting for the landing or loading screen. Idle breathing,
  a head tilt or a small hop can be driven procedurally on the Spine, neck and Head bones.
- Fox, frog and cat mascots: static meshes, 1.0 tall, feet on y = 0, facing +Z. Animate them like toys
  (bob, squash and stretch, hop, turn to look), which suits the chunky style. They match the line-up sheet,
  so the 2D sheet and the 3D models can sit side by side.
- Drum cradle (`drum-cradle-tripo.glb`, 1.00 x 0.76 x 0.99, feet on y = 0): bearing hubs centred near
  x = -0.32 and +0.32, y = 0.66, z = -0.05; hub inner faces at about x = -0.28 and +0.24; pedestal top at
  y = 0.20; ball chute at the front (+Z). A live glass drum of radius up to about 0.25 fits between the hubs,
  axle along X at y = 0.66. Scale the cradle and the app's drum (components/drum) together.
- Complete drum (`drum-brass-glass-tripo.glb`, 0.93 x 1.00 x 0.81): the glass is baked as a pearl shell with
  the coloured balls painted on its front, so it reads best from the front and at a distance, or as the
  loading-screen object. For the playable centrepiece prefer the cradle plus the real drum.
- All Higgsfield models are PBR (base colour, metallic-roughness, normal), 1024 px textures (drum and cradle
  2048 px).

## Free assets (CC0)

### Characters and avatars (more than a dozen variants)

- **Kenney Cube Pets**: 24 animals (beaver, bee, bunny, cat, caterpillar, chick, cow, crab, deer, dog,
  elephant, fish, fox, giraffe, hog, koala, lion, monkey, panda, parrot, penguin, pig, polar bear, tiger),
  each with 8 clips: static, idle, walk, run, eat, dance, gesture-positive, gesture-negative. Best fit for
  player avatars (one animal per profile, cheap, cute, chunky). https://kenney.nl/assets/cube-pets
- **Kenney Mini Characters**: 12 people, skinned, 32 clips (idle, walk, sprint, jump, sit, emote-yes,
  interact...). https://kenney.nl/assets/mini-characters
- **Kenney Blocky Characters**: 18 blocky people, 27 clips. https://kenney.nl/assets/blocky-characters
- **Quaternius** fox (24 clips), frog (14 clips), cat (8 clips), via Poly Pizza.

### Room dressing

- Poly Pizza CC0 items (each licence read on its page before download): stage (iPoly3D), double curtains
  (Quaternius), two chandeliers (CreativeTrio, Quaternius), hanging lantern, post lantern and pillar
  (Kay Lousberg), theatre spotlight (lakescorp), two spotlights (iPoly3D), column, small couch and houseplant
  (Quaternius), armchair (CreativeTrio). Authors and URLs are in the per-file table below. Their units vary
  (the stage is about 31 units wide): normalise the scale on load.
- Kenney Furniture Kit, lounge subset of 54 (sofas, lounge chairs, floor, table and wall lamps, plants,
  round and rectangular rugs, side and round tables, bar counter, bar stools, benches, speakers, radio,
  vintage TV, walls, doorway, stairs). Materials were kept separate (no palette merge) so sofas, rugs and
  wood can be recoloured to the velvet, plum, saffron and brass palette. https://kenney.nl/assets/furniture-kit
- Kenney Holiday Kit subset: string lights (3 colourways), lanterns, benches, wood and stone floor tiles.
  https://kenney.nl/assets/holiday-kit
- Kenney Mini Arcade subset (game-hall flavour without gambling): air hockey, arcade cabinet, pinball,
  dance machine, basketball game, vending machine, column, floor, walls, two staff characters.
  https://kenney.nl/assets/mini-arcade

### HDRI (Poly Haven, CC0)

| file | source | author |
|---|---|---|
| `hdri/warm_bar_1k.hdr` (1.5 MB) | https://polyhaven.com/a/warm_bar | Greg Zaal (photography), Jarod Guest (processing) |
| `hdri/theater_01_1k.hdr` (1.6 MB) | https://polyhaven.com/a/theater_01 | Oliksiy Yakovlyev |

warm_bar gives the brass a warm gold; theater_01 adds red velvet and stage-light reflections. Use one as
`scene.environment` at about 0.5 to 0.8 intensity, not as the visible background.

### Materials (ambientCG, CC0): 1024 px WebP colour, OpenGL normal and roughness maps

| folder | use | source |
|---|---|---|
| `textures/Fabric026/` | red fabric; tint it for velvet seats, rug, curtains | https://ambientcg.com/view?id=Fabric026 |
| `textures/WoodFloor064/` | dark parquet for the hall floor | https://ambientcg.com/view?id=WoodFloor064 |
| `textures/Marble016/` | black reflective marble for the stage top or table tops | https://ambientcg.com/view?id=Marble016 |

### 2D art (Higgsfield, this run)

| file | what |
|---|---|
| `art/mascot-lineup.webp` (1600 px) | the four mascots side by side: loading screen, profile picker, X cards |
| `art/bear-front.webp` | bear host, front view |
| `art/drum-concept.webp` | hero drum concept render |
| `art/drum-cradle-concept.webp` | empty cradle concept render |

## v20 build: what the hall ships, and what was derived

Everything below follows the same safety policy (trusted sources, allowed file types only, no
executable downloaded or run). No new model was generated for the build; the derived files are
local re-optimizations of files already listed above.

### Derived models (gltf-transform 4.2.1 in a scratch folder, not a repo dependency)

| file | from | what was done | KB | tris |
|---|---|---|---:|---:|
| `models/higgsfield/bear-host-5k.glb` | `bear-host-meshy-rigged-wave.glb` (Higgsfield / Meshy, job 994614db) | simplify (ratio 0.2, error 0.03, skin kept), textures WebP 1024, meshopt | 295 | 7,976 |
| `models/higgsfield/fox-bellhop-5k.glb` | `fox-bellhop-tripo.glb` (Higgsfield / Tripo, job 8c034121) | simplify (ratio 0.2), textures WebP 1024, meshopt | 152 | 4,911 |
| `models/higgsfield/stanchion-velvet-rope-3k.glb` | `stanchion-velvet-rope-tripo.glb` (Higgsfield / Tripo, job ace3e667) | simplify (ratio 0.22), textures WebP 512, meshopt | 54 | 2,868 |
| `models/higgsfield/drum-cradle-1k.glb` | `drum-cradle-tripo.glb` (Higgsfield / Tripo, job f86fd795) | textures WebP 1024, meshopt | 379 | 24,253 |
| `textures/Fabric026/Fabric026_{normalgl,roughness}.webp` | ambientCG Fabric026 (CC0) | downsized to 512 px | 42 + 33 | |

The bear keeps more triangles than the 5k target (the simplifier keeps the skinned seams); it is
still under 300 KB.

### Rendered from the real scene (never generated)

| file | how | license |
|---|---|---|
| `assets/pets/{species}-{scarf}.webp` (72 files, 256 px, about 4.8 KB each, 346 KB in all) | `scripts/render-pets.mjs` through the dev route `/art/pets`: the 12 Kenney Cube Pets (fox, cat, bunny, panda, penguin, koala, polar, chick, pig, cow, elephant, bee) with the procedural scarf in each of the 6 identity colours | derived from Kenney Cube Pets, CC0 1.0 |
| `/hall-poster.webp` (1600 × 900), `/hall-poster-mobile.webp` (750 × 1000) | `scripts/render-art.mjs` through `/art/poster` and `/art/poster-mobile` | the hall's own assets (CC0 + Higgsfield, above) |
| `/art/{join,seal,draw,serve}.webp` (640 × 400) | `scripts/render-art.mjs` through `/art/<scene>` | same |
| `/stills/porthole-drum.webp` (560 × 560, WebP q80, 36,066 bytes; v21 home section II) | a CDP capture of the real hall (the `home` shot, overlays hidden), cropped square on the drum (DESIGN-BRIEF v21 §6.3) | same |

### Higgsfield, this build

| file | job | model | credits |
|---|---|---|---:|
| `/art/velvet.webp` (1024 × 576, the loader's velvet curtains; raw 2688 × 1520 PNG in `app/.assets-staging/higgsfield/velvet-curtain-a3ec2b7d.png`) | a3ec2b7d | GPT Image 2, medium, 2k (the free plan refuses `gpt_image_2_5`) | 2 |

Account balance after this build: 1,407.79 credits (free plan). Total for the v20 run: about 164
credits before the build (118 asset pass + 46 concepts) + 2 here.

### Shipped in v20 (loaded by the hall)

Cube Pets: the 12 launch species above (the other 12 are kept, not loaded). Furniture:
`lampWall`, `tableRound`, `lampRoundTable`, `pottedPlant`. Poly Pizza: `curtains-double-quaternius`,
`column-quaternius`, `lantern-hanging-kaylousberg`, `couch-small-quaternius`, `armchair-creativetrio`,
`spotlight-a-ipoly3d`. Higgsfield: `drum-cradle-1k`, `bear-host-5k`, `fox-bellhop-5k`,
`stanchion-velvet-rope-3k`. HDRI: `warm_bar_1k.hdr` (high tier only). Textures: WoodFloor064,
Marble016 (colour, normal), Fabric026 (normal, roughness at 512). Not loaded: the mini and blocky
characters, the mini arcade (game-cabinet look), the holiday string lights, the Quaternius fox, frog
and cat, both chandeliers, the pillar and post lantern, the houseplant, the other two spotlights,
the stage, `drum-brass-glass-tripo` (opaque glass), `ladle-emblem-tripo` (off-brand: the 3D ladle is
extruded from `ladle-mark.svg`), `theater_01_1k.hdr`, and the frog crooner and cat usher (kept for
stills).

First load, high tier, measured on disk: about 3.6 MB of assets (HDRI 1.49, cradle 0.39, bear 0.30,
fox 0.16, stanchion 0.05, three pets 0.14, props 0.07, textures 0.62, poster 0.10); about 2.1 MB on
the mid tier (no HDRI). The other nine pets load on demand (about 0.4 MB).

`_staging/` (about 98 MB of raw downloads) moved out of `public/` to `app/.assets-staging/`
(git-ignored).

## v21 brand (logo and kit)

The logo is drawn from scratch in `app/scripts/brand-lib.mjs` (no font, no generated image in the
shipped files). Downloads for it, each in its own scratch folder, allowed types only:

| file | source | license | used for |
|---|---|---|---|
| `app/scripts/fonts/Fraunces[SOFT,WONK,opsz,wght].ttf` + `OFL-Fraunces.txt` | github.com/google/fonts `ofl/fraunces` | SIL OFL 1.1 | the tagline on the lockup, banner and OG image (as paths); the proposed display face |

Fonts downloaded only to compare (scratch, not in the repo): Young Serif, Big Shoulders Display,
Titan One, Rammetto One, Bungee, Gloock, Archivo Black (google/fonts, OFL).

Higgsfield (the user's account, free plan; Recraft, GPT Image 2.5, Seedream 5 Pro and GPT Image 2
are refused on it): 28 logo concepts in `app/screenshots/v21/brand/explore/` (nano banana pro,
nano banana 2, ideogram 4.5) and 3 application renders made from the vector in
`app/screenshots/v21/brand/applications/` (enamel pin, brass sign, the brass ladle as an object).
About 36 credits. None of them ships in `public/`.

## Every optimized model (generated from manifest.json)

### higgsfield (8 files, 2980 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/higgsfield/bear-host-meshy-rigged-wave.glb` | 402 | 18934 | Armature\|Big_Wave_Hello\|baselayer (skinned) | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/cat-usher-tripo.glb` | 273 | 23938 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/drum-brass-glass-tripo.glb` | 788 | 36188 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/drum-cradle-tripo.glb` | 674 | 24253 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/fox-bellhop-tripo.glb` | 270 | 24560 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/frog-crooner-tripo.glb` | 255 | 25104 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/ladle-emblem-tripo.glb` | 180 | 16474 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |
| `models/higgsfield/stanchion-velvet-rope-tripo.glb` | 139 | 13040 |  | Ladle / Higgsfield AI | Generated with Higgsfield (user account) | https://higgsfield.ai |

### kenney-blocky-characters (18 files, 865 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-blocky-characters/character-a.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-b.glb` | 46 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-c.glb` | 47 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-d.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-e.glb` | 47 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-f.glb` | 46 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-g.glb` | 50 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-h.glb` | 48 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-i.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-j.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-k.glb` | 47 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-l.glb` | 50 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-m.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-n.glb` | 49 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-o.glb` | 51 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-p.glb` | 48 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-q.glb` | 46 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |
| `models/kenney-blocky-characters/character-r.glb` | 45 | 72 | 27 (static, idle, walk, sprint...) | Kenney | CC0 1.0 | https://kenney.nl/assets/blocky-characters |

### kenney-cube-pets (24 files, 1039 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-cube-pets/animal-beaver.glb` | 46 | 670 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-bee.glb` | 51 | 742 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-bunny.glb` | 40 | 575 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-cat.glb` | 51 | 678 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-caterpillar.glb` | 40 | 578 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-chick.glb` | 40 | 490 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-cow.glb` | 42 | 578 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-crab.glb` | 46 | 676 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-deer.glb` | 44 | 756 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-dog.glb` | 38 | 490 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-elephant.glb` | 47 | 676 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-fish.glb` | 30 | 414 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-fox.glb` | 45 | 568 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-giraffe.glb` | 40 | 598 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-hog.glb` | 42 | 706 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-koala.glb` | 40 | 594 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-lion.glb` | 51 | 883 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-monkey.glb` | 51 | 910 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-panda.glb` | 40 | 734 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-parrot.glb` | 50 | 530 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-penguin.glb` | 40 | 558 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-pig.glb` | 41 | 424 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-polar.glb` | 34 | 522 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |
| `models/kenney-cube-pets/animal-tiger.glb` | 50 | 945 | 8 (static, idle, walk, run...) | Kenney | CC0 1.0 | https://kenney.nl/assets/cube-pets |

### kenney-furniture (54 files, 230 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-furniture/bench.glb` | 3 | 170 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/benchCushion.glb` | 5 | 196 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/bookcaseOpenLow.glb` | 3 | 184 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/chairCushion.glb` | 5 | 198 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/chairRounded.glb` | 4 | 276 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/coatRackStanding.glb` | 4 | 190 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/doorwayOpen.glb` | 2 | 28 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/floorCornerRound.glb` | 2 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/floorFull.glb` | 2 | 12 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/kitchenBar.glb` | 5 | 76 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/kitchenBarEnd.glb` | 5 | 152 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampRoundFloor.glb` | 4 | 76 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampRoundTable.glb` | 4 | 76 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampSquareCeiling.glb` | 4 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampSquareFloor.glb` | 4 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampSquareTable.glb` | 4 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/lampWall.glb` | 3 | 42 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeChair.glb` | 4 | 128 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeChairRelax.glb` | 6 | 188 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeDesignChair.glb` | 4 | 116 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeDesignSofa.glb` | 4 | 116 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeDesignSofaCorner.glb` | 5 | 176 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeSofa.glb` | 4 | 128 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeSofaCorner.glb` | 5 | 190 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeSofaLong.glb` | 5 | 186 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/loungeSofaOttoman.glb` | 4 | 84 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/paneling.glb` | 2 | 40 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/pillow.glb` | 3 | 50 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/plantSmall1.glb` | 4 | 102 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/plantSmall2.glb` | 5 | 158 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/plantSmall3.glb` | 4 | 98 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/pottedPlant.glb` | 5 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/radio.glb` | 8 | 421 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/rugRectangle.glb` | 3 | 28 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/rugRound.glb` | 4 | 188 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/rugRounded.glb` | 4 | 204 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/rugSquare.glb` | 3 | 28 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/sideTable.glb` | 4 | 118 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/sideTableDrawers.glb` | 6 | 238 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/speaker.glb` | 5 | 228 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/speakerSmall.glb` | 5 | 220 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/stairs.glb` | 6 | 308 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/stoolBar.glb` | 4 | 172 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/stoolBarSquare.glb` | 4 | 142 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/tableCloth.glb` | 4 | 144 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/tableCoffee.glb` | 3 | 124 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/tableCoffeeGlass.glb` | 4 | 140 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/tableCrossCloth.glb` | 5 | 202 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/tableRound.glb` | 3 | 76 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/televisionVintage.glb` | 8 | 280 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/wall.glb` | 4 | 12 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/wallCorner.glb` | 4 | 28 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/wallDoorwayWide.glb` | 5 | 60 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |
| `models/kenney-furniture/wallWindow.glb` | 6 | 108 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/furniture-kit |

### kenney-holiday (9 files, 100 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-holiday/bench-short.glb` | 7 | 160 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/bench.glb` | 7 | 160 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/floor-stone.glb` | 6 | 48 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/floor-wood.glb` | 6 | 112 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/lantern-hanging.glb` | 8 | 152 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/lantern.glb` | 8 | 172 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/lights-colored.glb` | 19 | 760 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/lights-green.glb` | 19 | 760 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |
| `models/kenney-holiday/lights-red.glb` | 19 | 760 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/holiday-kit |

### kenney-mini-arcade (13 files, 218 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-mini-arcade/air-hockey.glb` | 10 | 438 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/arcade-machine.glb` | 11 | 392 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/basketball-game.glb` | 12 | 516 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/character-employee.glb` | 60 | 522 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/character-gamer.glb` | 59 | 477 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/column.glb` | 7 | 188 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/dance-machine.glb` | 14 | 650 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/floor.glb` | 5 | 24 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/pinball.glb` | 15 | 592 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/vending-machine.glb` | 7 | 176 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/wall-corner.glb` | 6 | 70 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/wall-window.glb` | 8 | 138 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |
| `models/kenney-mini-arcade/wall.glb` | 5 | 46 |  | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-arcade |

### kenney-mini-characters (12 files, 757 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/kenney-mini-characters/character-female-a.glb` | 65 | 876 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-female-b.glb` | 63 | 742 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-female-c.glb` | 63 | 732 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-female-d.glb` | 64 | 796 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-female-e.glb` | 63 | 756 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-female-f.glb` | 64 | 788 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-a.glb` | 62 | 720 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-b.glb` | 62 | 690 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-c.glb` | 65 | 792 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-d.glb` | 62 | 708 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-e.glb` | 62 | 706 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |
| `models/kenney-mini-characters/character-male-f.glb` | 63 | 701 | 32 (static, idle, walk, sprint...) (skinned) | Kenney | CC0 1.0 | https://kenney.nl/assets/mini-characters |

### polypizza (17 files, 721 KB)

| file | KB | tris | clips | author | license | source |
|---|---:|---:|---|---|---|---|
| `models/polypizza/armchair-creativetrio.glb` | 7 | 161 |  | CreativeTrio | CC0 1.0 | https://poly.pizza/m/myd1WSucAz |
| `models/polypizza/cat-quaternius.glb` | 47 | 2322 | 8 (AnimalArmature\|AnimalArmature\|AnimalArmature\|Death, AnimalArmature\|AnimalArmature\|AnimalArmature\|Headbutt, AnimalArmature\|AnimalArmature\|AnimalArmature\|Idle, AnimalArmature\|AnimalArmature\|AnimalArmature\|Idle_Eating...) (skinned) | Quaternius | CC0 1.0 | https://poly.pizza/m/qKICY6xla2 |
| `models/polypizza/chandelier-creativetrio.glb` | 21 | 1204 |  | CreativeTrio | CC0 1.0 | https://poly.pizza/m/RPLTkXHOOM |
| `models/polypizza/chandelier-light-quaternius.glb` | 9 | 972 |  | Quaternius | CC0 1.0 | https://poly.pizza/m/q3k8I8YYX9 |
| `models/polypizza/column-quaternius.glb` | 10 | 532 |  | Quaternius | CC0 1.0 | https://poly.pizza/m/wLubNpOTX4 |
| `models/polypizza/couch-small-quaternius.glb` | 7 | 716 |  | Quaternius | CC0 1.0 | https://poly.pizza/m/ZOPP3KzNIk |
| `models/polypizza/curtains-double-quaternius.glb` | 5 | 181 |  | Quaternius | CC0 1.0 | https://poly.pizza/m/kkeII96j9N |
| `models/polypizza/fox-quaternius.glb` | 307 | 1848 | 24 (Attack, Death, Eating, Gallop...) (skinned) | Quaternius | CC0 1.0 | https://poly.pizza/m/Bc97C66HKi |
| `models/polypizza/frog-quaternius.glb` | 137 | 4856 | 14 (CharacterArmature\|Death, CharacterArmature\|Duck, CharacterArmature\|HitReact, CharacterArmature\|Idle...) (skinned) | Quaternius | CC0 1.0 | https://poly.pizza/m/37wofOCOzG |
| `models/polypizza/houseplant-quaternius.glb` | 8 | 441 |  | Quaternius | CC0 1.0 | https://poly.pizza/m/bfLOqIV5uP |
| `models/polypizza/lantern-hanging-kaylousberg.glb` | 15 | 472 |  | Kay Lousberg | CC0 1.0 | https://poly.pizza/m/3jzk3YShv1 |
| `models/polypizza/pillar-kaylousberg.glb` | 11 | 94 |  | Kay Lousberg | CC0 1.0 | https://poly.pizza/m/1nt8n3rVKU |
| `models/polypizza/post-lantern-kaylousberg.glb` | 17 | 568 |  | Kay Lousberg | CC0 1.0 | https://poly.pizza/m/ZSQ65S4lEu |
| `models/polypizza/spotlight-a-ipoly3d.glb` | 11 | 950 |  | iPoly3D | CC0 1.0 | https://poly.pizza/m/t0roJdkhIa |
| `models/polypizza/spotlight-b-ipoly3d.glb` | 20 | 2254 |  | iPoly3D | CC0 1.0 | https://poly.pizza/m/6kFDJ0GRdr |
| `models/polypizza/spotlight-theater-lakescorp.glb` | 15 | 456 |  | lakescorp | CC0 1.0 | https://poly.pizza/m/Thhuwj9HCg |
| `models/polypizza/stage-ipoly3d.glb` | 74 | 6323 |  | iPoly3D | CC0 1.0 | https://poly.pizza/m/dGRAisemWy |

## v21 house UI (build:core, 2026-10-27)

### Fonts (self-hosted latin subsets, SIL Open Font License 1.1)

Sources (github.com/google/fonts, raw URLs, downloaded into the new directory `app/scripts/fonts/v21-src/`):
- `ofl/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf` (414,904 bytes) - https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf
- `ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf` (176,068 bytes) - https://raw.githubusercontent.com/google/fonts/main/ofl/schibstedgrotesk/SchibstedGrotesk%5Bwght%5D.ttf
- `ofl/schibstedgrotesk/OFL.txt` (copied to `app/scripts/fonts/OFL-SchibstedGrotesk.txt`)
- The roman Fraunces was already at `app/scripts/fonts/Fraunces[SOFT,WONK,opsz,wght].ttf` (360,440 bytes, OFL in `OFL-Fraunces.txt`).

Commands (fontTools 4.66.1; brotli is not installed, so the output is WOFF):
- `py -m fontTools.varLib.instancer "Fraunces[SOFT,WONK,opsz,wght].ttf" wght=400:800 SOFT=0 WONK=0 -o fraunces-roman.ttf`
- `py -m fontTools.varLib.instancer "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf" wght=400:700 SOFT=0 WONK=0 -o fraunces-italic.ttf`
- `py -m fontTools.varLib.instancer "SchibstedGrotesk[wght].ttf" wght=400:700 -o schibsted.ttf`
- `py -m fontTools.subset <in>.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215" --layout-features="kern,liga,case,ss01,rvrn,tnum,pnum,zero" --flavor=woff --output-file=app/public/fonts/<name>-latin.woff`
- For the brand and OG generators (opentype.js reads static fonts): `py -m fontTools.varLib.instancer schibsted.ttf wght=500 -o schibsted-500.ttf` and `wght=600 -o schibsted-600.ttf`.

| file | bytes | axes |
|---|---:|---|
| `public/fonts/fraunces-roman-latin.woff` | 78,012 | opsz 9-144, wght 400-800 |
| `public/fonts/fraunces-italic-latin.woff` | 91,724 | opsz 9-144, wght 400-700 |
| `public/fonts/schibsted-latin.woff` | 48,644 | wght 400-700 |
| `scripts/fonts/fraunces-roman.ttf` | 201,944 | (generators) |
| `scripts/fonts/fraunces-italic.ttf` | 232,572 | (generators) |
| `scripts/fonts/schibsted.ttf` | 198,636 | (generators) |
| `scripts/fonts/schibsted-500.ttf`, `schibsted-600.ttf` | 100,920 / 101,044 | static, make-brand / make-og |

First-load font bytes: 218,380 (under the 220 KB budget). Removed: `dela-gothic-one-latin.woff2`, `bricolage-grotesque-latin.woff2`, `geist-mono-latin.woff2`, `scripts/fonts/Geist-*.ttf`, `scripts/fonts/BricolageGrotesque[...].ttf` and their OFL texts.

### UI textures (Higgsfield, the user's account)

Generated with `nano_banana_2` (1k, 1:1, never `use_unlim`), downloaded with curl into the new directory `app/public/assets/textures/ui-v21/src/` and then moved out of `public/` to `app/scripts/textures-v21-src/` (sources only, not served). Made seamless and encoded by `app/scripts/make-textures.mjs` (roll by half, 64 px cross-fade, WebP); tile checks in `app/screenshots/v21/textures/`. Every prompt ends with "seamless tileable texture, top-down, even flat lighting, no vignette, no shadows, no objects, no text".

| file | prompt (start) | size | bytes | where |
|---|---|---|---:|---|
| `textures/ui-v21/walnut-veneer.webp` | "dark American walnut crown-cut veneer, very low contrast, matte oil finish" | 1024 | 52,666 | inner top bar, footer, share card: 6 %, soft-light |
| `textures/ui-v21/velvet-oxblood.webp` | "deep oxblood crushed velvet, soft pile sheen, colour #4A1418" | 1024 | 131,492 | loader curtains (under the pleats and a dark wash) |
| `textures/ui-v21/paper-stock.webp` | "warm cream cotton paper with faint fibres" | 512 | 7,054 | ticket stub, demo slip (multiply) |
| felt | "deep green wool felt, colour #12352F, fine fibres" | - | - | not shipped: three attempts failed or were flagged by the service; the CSS fallback (flat `--felt-900`) is used |

Credits: 8 submissions in the first batch (3 completed), 4 retries (1 completed); 4 images delivered at 1.5 credits each on nano_banana_2 = 6 credits (balance 1,286.29 before, 1,280.29 after). The second velvet variant showed seams in its tile check and was dropped.

## v21.1 - one family, Figtree (restyle:screens, 2026-10-28)

The type is born from the wordmark: Figtree (Erik Kennedy, SIL OFL 1.1) at 900 with `ss01` draws the logo's own single-storey a, l, d and e. It is self-hosted from the full upstream variable file, because the Google Fonts CSS API serves Figtree without `ss01` and `ss02` (evidence: `screenshots/v21/restyle/final/ss01-google-vs-local.png`).

Source (github.com/google/fonts): `ofl/figtree/Figtree[wght].ttf` (62,712 bytes) - https://github.com/google/fonts/raw/main/ofl/figtree/Figtree%5Bwght%5D.ttf, with `ofl/figtree/OFL.txt`. The same file was already in `screenshots/v21/restyle/sibling/fonts/figtree/` (downloaded by the direction step) and was copied into the new directory `app/scripts/fonts/figtree-src/` with its licence; the licence is also at `app/scripts/fonts/OFL-Figtree.txt`.

Commands (fontTools 4.66.1, `py -I`; brotli is not installed, so the output is WOFF):
- `py -I -m fontTools.varLib.instancer "Figtree[wght].ttf" wght=400:900 -o scripts/fonts/figtree-400-900.ttf` (63,132 bytes; for make-og, make-brand and satori)
- `py -I -m fontTools.subset scripts/fonts/figtree-400-900.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215" --layout-features="kern,liga,case,ss01,ss02,tnum,pnum,frac,numr,dnom,ccmp,locl,rvrn" --flavor=woff --output-file=public/fonts/figtree-latin.woff`

| file | bytes | notes |
|---|---:|---|
| `public/fonts/figtree-latin.woff` | 24,740 | wght 400-900; GSUB `case dnom frac locl numr pnum rvrn ss01 ss02 tnum`; loaded by next/font/local in `app/layout.tsx` (`--font-figtree`); also registered with FontFace for the share card |
| `scripts/fonts/figtree-400-900.ttf` | 63,132 | generators |

First-load font bytes: 24,740 (one file). The three v21 web fonts (`fraunces-roman-latin.woff`, `fraunces-italic-latin.woff`, `schibsted-latin.woff`) left `public/fonts/`: they were moved, not destroyed, to `app/scripts/fonts/v21-retired/` (delete that folder when nothing needs them). The Fraunces and Schibsted TTFs in `app/scripts/fonts/` stay while `scripts/brand-lib.mjs` still reads them.

Pet portrait thumbs: `public/assets/pets/thumb/<species>-<scarf>.webp`, 72 files of 64 x 64 (WebP q 80, cover, focus 50 % 30 %), made from the 256 px portraits by `scripts/make-pet-thumbs.mjs` (sharp). Used by the chat discs, the presence stack, the player plate and the species tiles.

UI textures retired from the interface: `textures/ui-v21/paper-stock.webp` and `walnut-veneer.webp` are no longer read by any UI rule (velvet stays on the loader curtains).
