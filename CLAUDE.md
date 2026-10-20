# AWS City — agent guide

An MV3 browser extension for Chrome/Edge, Firefox and Safari (WXT + React 19 + Phaser 4 + zustand): an isometric AWS learning city.
The frontend is complete against a mock backend; the AWS backend plugs in through one contract.

## Decisions (each with the command that proves it)

- **Backend: `server/`** (Node + TS, Claude on Bedrock). It runs locally against the workshop
  account, which denies CloudFormation and `iam:CreateRole`, or hosted in our own account via `infra/`.
  The AgentCore/Strands backend is parked on `parked/agentcore-backend`. Proof: `cd server && npm test`
  (the server imports `src/backend/contract.ts`, so contract drift breaks its build: `npx tsc --noEmit -p server`).
- **Two deployments of one server:** local (`AUTH_MODE=token`, workshop profile, files; loopback
  only) and hosted (`AWS_CITY_MODE=hosted`: Cognito JWT in the WebSocket subprotocol, one tenant
  per player, DynamoDB/S3, each player's own account via `AWSCityPlayerRole-<region>` + ExternalId).
  `server/src/config.ts` refuses unsafe mixes. Proof: `cd server && npx vitest run test/hosted.test.ts`.
- **The player role allows exactly what the server calls, and trusts only our account.** The trust is
  fixed at publish time, not a parameter. Proof: `cd server && npx vitest run test/player-role.test.ts`.
- **Infra is CDK with cdk-nag AwsSolutions clean.** Every acknowledgement carries a reason. Deploys need no
  Docker: the server image is built in CodeBuild (`@cdklabs/deploy-time-build`).
  Proof: `cd infra && npm test && npx cdk synth -q`.
- **Agents are grounded, never unrestricted:** docs come from the read-only AWS Knowledge MCP server
  (allow-listed tools, `<aws_docs>` treated as data, official AWS hosts only). There's no AWS CLI tool
  and no managed AWS MCP Server (`aws___run_script`), and nothing from the Strands tools package.
  Proof: `cd server && npx vitest run test/knowledge.test.ts`.
- **Every agent runs on Strands Agents (TypeScript)**, pinned `@strands-agents/sdk` (npm `overrides` shares our
  `@anthropic-ai/sdk`). `AnthropicModel` gets our `AnthropicBedrock` client (the InvokeModel route) behind the quota
  gate; tools are the ActionService allowlist (citizens: read-only), a sequential executor, a 5-tool cap, no structured
  output (it forces `tool_choice`), no vended HITL (approval stays in ActionService: a write gets the player's approval
  channel or is refused). Citizens always; landmark agents too by default (`AWS_CITY_AGENT_ENGINE=classic` keeps the
  hand-written loop as a fallback). Landmark agents run at `effort: 'high'`, citizens `low`. Source: `.claude/references/cached-sources.md`.
  Proof: `cd server && npx vitest run test/citizens.test.ts`.
- **AWS's public status and news reach every player, read once by the server** (`server/src/news/`, contract v2.6 `aws.health`/`aws.news`).
  The sources are the public Health Dashboard JSON (UTF-16 with a BOM), with the status RSS as fallback, and What's New. Hosts are
  allow-listed, there are no redirects, a size cap and a timeout, and a failure backs off. Feed text is untrusted data (neutralised,
  trimmed, never given to a model). Services map only through verified codes in `shared/aws-health-services.json`. There's no IAM and
  no Health API (it needs a Business support plan). The demo plays the real Bahrain/UAE events plus a `drill: true` practice event.
  Proof: `cd server && npx vitest run test/news.test.ts test/tenants.test.ts`, `npx vitest run tests/incidents.test.ts tests/contract.test.ts`.
- **Findings are rules; the model only explains.** `server/src/agents/findings.ts` checks each poll (no model calls);
  players read `shared/wa-rules.json`; an unreadable setting never raises a finding.
  Proof: `cd server && npx vitest run test/care.test.ts`.
- **Fixes only tighten, are opt-in, and each one is approved.** A fixed allowlist (`server/src/agents/fixes.ts`) re-reads
  the resource before the preview and again inside the account lock after approval, one fix per finding at a time. The
  player role grants the fix actions only with `AllowFixes=true`. IAM holds an IMDS change's `HttpTokens` to `required` (not its
  other options) and EBS to enable-only; for S3 Block Public Access, DynamoDB PITR and security-group revokes it can't, so the code does (and the
  template says so). Undo is the player's, in the console. Outside the city's own resources the player types the
  resource id, and the citizen must be level 3 (a teaching gate, not a security control). Local mode needs
  `AWS_CITY_ALLOW_FIXES=true`.
  Proof: `cd server && npx vitest run test/fixes.test.ts test/player-role.test.ts test/care.test.ts`.
- **AWS plugins for Claude Code** (`.claude/settings.json`): `aws-core` and `aws-agents` from
  `claude-plugins-official` (Agent Toolkit for AWS). Use their skills (aws-cdk, aws-iam, aws-containers,
  aws-networking, aws-security, aws-well-architected-review…) when changing infra or the server. The
  aws-core MCP server's `aws___run_script` acts with the *developer's* credentials: it's for the dev
  session only, every call asks first (`permissions.ask` in `.claude/settings.json`), and it's never wired
  into the game's agents (they get only allow-listed read-only docs tools). Proof: `cd server && npx vitest run test/knowledge.test.ts`.
- **Every AWS write needs the player's approval** (contract v2 `deploy.preview` → `deploy.approve`).
  With no approval channel, writes are refused (only reads run). Proof: `server/test/approvals.test.ts`,
  `server/test/service.test.ts` ("refuses every write without an approval channel").
- **Linking an AWS account, approving a write and applying a fix need MFA (step-up).** Hosted players must have TOTP
  on for `account.link`/`account.verify`, `deploy.approve` and `finding.fix` (Google sign-ins are exempt); prod Cognito runs Plus with threat protection.
  A "TOTP is on" answer is cached 60 s at most. Proof: `cd server && npx vitest run test/hosted.test.ts -t "MFA"`
  (includes "MFA step-up for writes"), `cd infra && npm test`.
- **Hosted deploys only run in Regions with a Claude geo inference profile** (`infra/lib/models.ts`: `us`, `eu`, `au`,
  `in`; there is no `apac` profile, so e.g. Tokyo is refused). Each geo gets the newest pair with a profile there for
  both models (`GEO_MODELS`, from the Bedrock model cards): Claude Opus 5.5 / Sonnet 5.5 in `us`/`eu`/`au`; India has no
  5.5 profile and keeps Opus 5 / Sonnet 5. Model ids and their IAM ARNs derive from the Region; synth and the setup
  wizard refuse other Regions. Local mode keeps the `us.` defaults in `server/src/config.ts` (Opus 5.5 / Sonnet 5.5).
  Proof: `cd infra && npm test`.
- **Bedrock calls never force `tool_choice`** (Bedrock rejects it while thinking is on, and always for
  Claude 5.5-generation models; the defaults are Opus 5.5 / Sonnet 5.5, `server/src/config.ts`, but any model can be
  configured). Ask for the tool in the prompt and handle a missing call. Short routes use `effort: 'low'`. On 5.5
  thinking can't be turned off (never send `thinking: {type: 'disabled'}`), Opus 5.5 defaults to `medium` effort (set it
  where depth matters), and agent histories stay append-only (edited turns are refused).
  Proof: `cd server && npx vitest run test/console.test.ts`.
- **Players see no internal errors.** Hosted errors are a sentence plus a `ref` that finds the log line
  (`publicError` in `server/src/log.ts`). Proof: `cd server && npx vitest run test/log.test.ts`.
- **One seam to the backend.** Only `src/backend/` does network I/O. `contract.ts` is the source of
  truth; `docs/backend-contract.md` mirrors it. UI code reading the extension's own files goes through
  `readAsset` (`src/backend/assets.ts`: same-origin `/assets/` paths only). A v2.14 client needs a v2.14 server (the
  strict schema refuses unknown fields; v2.14 adds `Progress.wallet`): deploy the server first. Proof: `npx vitest run tests/contract.test.ts tests/assets.test.ts`, and
  `grep -rn -e "fetch(" -e "WebSocket(" src | grep -v src/backend/` prints nothing.
- **Content is data in `shared/`** (world, flashcards, puzzles, quests, templates). JSON imports need
  `with { type: 'json' }` because the server runs as NodeNext ESM.
- **Art is generated, not hand-placed:** `npm run art` imports the team pack from
  `agentic-city/index.html`, then runs the character generator and the tile generator. The grid is
  **32×16**, the pack's exact scale. Sprite names must be unique, and the generator fails on duplicates. Frames are
  trimmed and MaxRects-packed: at most 3 pages of 2048 px and 10.5M packed px; two runs give a byte-identical atlas.
  Prop helpers live in `art/tiles/shapes.py`, the service-building kit in `art/tiles/services/kit.py` (a prism face is
  always solid; a bare `face()` shader returning None leaves the wall under it, for decals). Proof: `npx vitest run tests/art.test.ts`.
- **Text is crisp in a pixelArt world:** use `crisp()` from `src/game/SpeechBubble.ts` (LINEAR filter
  plus DPR resolution) and counter-scale by `1/zoom`. Camera zoom stays on integers.
- **Sound:** SFX only, no music; on by default and soft. One mixing path (synth voices play through Phaser's audio
  context), nothing scheduled before the first gesture (dropped, never queued), nothing while the page is hidden, a
  priority mixer so one action makes one sound (a big clip holds lower sounds for its own length), and mute synced across
  the panel and the tab (storage event), faded so it never clicks. Levels live in one table in `src/game/audio.ts`.
  Sounds answer the player: the city is silent while it sleeps (world map, HQs, games: `CityScene.play`), agents talking
  among themselves never blip (`silent`), one blip at a time in each speaker's fixed note, the work sound only for the
  player's own task, AWS status chimes follow the news rung, and the demo's chatter is talk only (no `agent.state`).
  Mini-game rounds start from a synced clock (`syncClock`), keep their end card on resize, and build combos (`combo.ts`).
  Proof: `npx vitest run tests/audio.test.ts tests/game-clock.test.ts tests/contract.test.ts`.
- **Each AWS Region is its own city, built from real facts.** A first run opens on the world map (`WorldScene`); picking a
  Region dives into its city (remembered in prefs). Each of the Region's real AZs is an island across the river that rings
  downtown (`zonesFor` → `azsFor`, slots in `AZ_SLOTS`; `shared/region-facts.json`: six in us-east-1, four in us-west-2; the
  linked account's own AZ names when known), with one bridge each onto a core road, so cross-AZ packets cross both bridges
  through downtown; a fenced lot for each service AWS doesn't offer there (with when, or whether, it's coming), and list prices per Region
  (`shared/prices.json`). Both files are generated with their sources: `npm run region-facts` (AWS Knowledge MCP; a service's own
  Regions page overrides the availability tool, see `OVERRIDES`; Security Agent, Macie and Polly have no tool rows, so their
  pages are the only source, `pageOnly`; `NOTES` carries a caveat a service's page states, re-read each run: App Runner is
  closed to new customers) and `npm run prices` (Price List Bulk API + the pricing pages'
  data; never the 440 MB EC2 file). The server mirrors every Region only with a Resource Explorer aggregator index in the home
  Region; findings are checked in the home Region. Proof: `npx vitest run tests/regions.test.ts tests/terrain.test.ts tests/roadgraph.test.ts tests/region-facts.test.ts tests/prices.test.ts`,
  `cd server && npx vitest run test/care.test.ts`.
- **Live traffic is opt-in, and real.** `flow.enable` (contract v2.8, `Progress.flow`) turns on a read of a few request
  counts from the player's CloudWatch (`server/src/state/flow.ts`: four fixed Metrics Insights queries, one per
  `GetMetricData` call, at most every 5 minutes while a tab is open, 96 a day, kept in memory only). The player role
  grants `cloudwatch:GetMetricData` alone, held to its Region (v4). The city drives request cars for the rates
  (`carsPerMinute`): load balancer requests to the AZ islands that served them, the rest to their buildings.
  Proof: `cd server && npx vitest run test/flow.test.ts test/player-role.test.ts`, `npx vitest run tests/contract.test.ts tests/carriers.test.ts`.
- **The city mirrors the account's map; the bill is opt-in.** `city.inventory.zones`/`regionStatus` come from
  `ec2:DescribeAvailabilityZones`/`DescribeRegions`, cached a day; a Region that can't be read is left out. `city.bill`
  (`ce:GetCostAndUsage`, $0.01 a request) is read only after `bill.enable {on:true}`, then at most once a day per player;
  `shared/ce-services.json` maps only verified Cost Explorer service names (the rest show as "other").
  Proof: `cd server && npx vitest run test/bill.test.ts test/care.test.ts test/player-role.test.ts`, `npx vitest run tests/contract.test.ts`.
- **Street plans come from OpenStreetMap, baked.** A Region with `shared/city-maps/<region>.json` (v1, ODbL, © OpenStreetMap
  contributors) gets a 64×64 core of its real downtown's streets: `src/world/citymap.ts` decodes and validates it,
  `src/world/zoning.ts` zones it (superblocks keep today's insides, blocks → water/park/building, 3×3 lots fronting a
  sidewalk, seven districts grown from compass seeds round the square, round robin to `DISTRICT_RESERVE` lots, then to
  ≥ max(services + 2, 10); HQ nearest the square, services nearest their seed in world.json order, so appending one moves
  nobody while its district has room; the map must hold services + 20 lots). A tight map tries harder before giving up
  (`EFFORTS`: drop minor streets, a neighbour's spare block, split big blocks, back streets `withAlleys`, build on the
  smallest parks; `CityPlan.zoning` says what it took): every baked Region zones. Anything that doesn't decode or zone,
  a Region without a file, or `?map=legacy` keeps `legacyPlan()` (`tests/plan-snapshot.test.ts`): six lots a district
  and no plot for the seventh (management), so the services it has no lot for (`UNPLACED_SERVICES`) aren't in that
  city (the places list says "not here in the classic city"; a quest's visit counts at once). The
  ring's land and sea come from the baked water mask; the ring river, islands, highway, park and airport keep their rules.
  The city shows "© OpenStreetMap contributors" (bottom-left, every zoom; ⋯ credits; postcards), linking only
  openstreetmap.org/copyright through `openOsmCopyright` (no map requests: the data is bundled). Minimap: `src/game/minimap.ts`
  + `src/ui/Minimap.tsx` (M toggles; on in the tab, a 🗺 button in the panel; click pans).
  Proof: `npx vitest run tests/plan.test.ts tests/plan-snapshot.test.ts tests/minimap.test.tsx tests/terrain.test.ts tests/roadgraph.test.ts`,
  `npm run smoke` (section "street maps": three real cities, day/night, tab/panel, `?map=legacy`).
- **The city stands in a landscape.** `src/world/terrain.ts` (pure, the same per Region every time) rings the core (40×40 legacy, 64×64 street map):
  a river round downtown, the Region's AZs as islands with bridges, the highway out through the gate, and a coast and biome
  sampled from the world map at the Region's real position (an impression, not a survey). `src/game/Landscape.ts` bakes
  the ground into RenderTextures (Phaser 4 needs `.render()`, re-baked on `restorewebgl`) and draws at most `MAX_PROPS`
  props; there's one sea colour, `src/game/palette.ts`, and it matches the sea texture. The core's ground is baked in chunks
  (`src/game/GroundBake.ts`, `src/game/chunks.ts`) and static props off the view are culled (`src/game/cull.ts`).
  Proof: `npx vitest run tests/terrain.test.ts tests/chunks.test.ts tests/cull.test.ts`.
- **City life is ambience, never AWS activity, with three exceptions: AWS's own status, data carriers, and learning couriers.** Traffic, boats, the sky
  and the dim baseline packets (`src/game/Ambient.ts`) only say how much of the account lives here. Ambient cars are data-themed
  for looks only (server, packet, fibre and cloud vans, `CAR_SKINS` in `src/game/Traffic.ts`): no beacon, never a carrier's colour,
  not tappable. The demo's links to other Regions arrive only once the practice account is linked (`demoInventory`
  `crossRegion`), so nothing the player didn't connect crosses the world map. Only agents' work animations
  and data carriers mean work: a replication tanker, a standby van and a request car drive only for a real `DataLink` of the
  account (`RegionOverlay` → `Ambient.dispatchData` → `Traffic.spawnData`), wear the `veh:data:*` sprites with a roof beacon,
  can be tapped (`CarrierCard`, text in `shared/carriers.json`), share the vehicle cap (an ambient car gives way; at most
  `DATA_CAP` 6/3) and fall back to the packet convoy when they can't drive. Learning couriers (`src/world/couriers.ts`) teach,
  they don't report: each drives one leg of a `shared/flows.json` flow between two buildings the player has put up (CloudFront →
  S3, API Gateway → Lambda…), a plain white car tinted its district's colour with a dashed trail, never a `veh:data:*` skin
  or a beacon; tapping one says what the flow does ("How data flows", the combo's or the flow's sentence and source). They
  share the vehicle cap (`LEARN_CAP` 3/2, `LEARN_RUSH_CAP` 5/3, both under the vehicle cap beside `DATA_CAP`); at the
  city's rush hour (8–9 and 17–18 local) more set off and Auto Scaling plays at EC2 and Lambda (`SCALERS`: helpers in
  the workers' places, so the crowd cap holds; they scale in when it ends). Storms
  (`src/game/Weather.ts`) and red/amber outage fences come only from the public AWS Health Dashboard (contract v2.6 `aws.health`). They're
  pooled and run without tweens; they pause while the page is hidden and park under reduced motion. Each surface has caps
  (applied by `Ambient.setSurface`, tab/panel; defined in `src/world/traffic.ts`, `Boats.ts`, `Sky.ts`, `Packets.ts`): citizens 26/14 (`crowdSize`: districts open plus one per Practitioner building), vehicles 14/8, boats 3/2, clouds 3/2, packets 24/16. A* gives up after
  6,000 expansions (a binary-heap open set), routes are cached per grid version, and `CityMap.sync` skips the ground pass unless a district or tier changed.
  Proof: `npx vitest run tests/traffic.test.ts tests/traffic-sim.test.ts tests/carriers.test.ts tests/roadgraph.test.ts tests/flow-trickle.test.ts tests/pathfinding.test.ts`;
  `npm run smoke` asserts the caps from `awsCity.ambient.stats()` and logs FPS (it only warns, and headless caps it at 30).
  Learning traffic: `npx vitest run tests/living-city.test.ts`; `npm run smoke` (81: couriers and helpers at rush hour).
- **A city that looks and feels alive** (round 3). *Combos:* `shared/combos.json` (20 pairs and trios, each with one plain
  fact and its AWS docs source, `combo:<id>` art) are found when every service is put up in this city (`combosFound`);
  each prop stands on free ground nearest the middle of its buildings within its `radius` (`placeCombos`, before the
  rest of decor, a tile apart, never beside a door; no `rng()`), is tappable for its fact, and a new one sparkles and goes
  to the Codex (`discoverCombo`). *Seasons* (`src/world/seasons.ts`): meteorological, by the real month and the Region's
  hemisphere (summer all year inside the tropics); `?season=winter` (dev) or `prefs.season` overrides. The art swaps
  `<name>` for `season:<s>:<name>` where it exists (`seasonal()` in `src/game/assets.ts`, same canvas and anchor), the baked
  ground takes `SEASON_TINT` and stamped decals (snow, leaves, petals), and some flower beds become snowmen or umbrellas
  (nothing added, so no extra draw calls). *Next-level previews* (`src/world/preview.ts`): a picked building shows its next
  level's sprite see-through over it, rimmed in blueprint blue (Phaser 4 `Glow` filter, knockout, WebGL only), and one
  line ("Next: Practitioner · adds “…” · 7 reviews to go"). Combos already standing when a city loads go into the Codex
  quietly (`discoverCombo(id, { quiet: true })`: no toast, no coins). *Pocket parks*
  pick their centrepiece and corner piece by the lot (`pocketParkFor`, `bigParkFor`, `parkCornerFor`), and a building site
  (tier 0) draws only its own crane (no second `crane1x1`). Proof: `npx vitest run tests/living-city.test.ts tests/art.test.ts
  tests/plan-snapshot.test.ts tests/clients.test.ts`; `npm run smoke` (80 combo found, 82 ghost, 83 parks, 84 a business
  inside us-west-2, 85 winter).
- **Tabs: City · Learn · Jobs · Deploy** (`TABS` in `src/app/App.tsx`; ids `home`/`learn`/`jobs`/`deploy`). City is today's
  shift plus the places list, and a tapped building's card opens there (no other tab). Learn is Cards · Puzzles · Drawing
  board; Jobs is City Clients (the order board, then every business; `openClients(id)` routes there); Deploy is the old
  Build tab. HUD Build is "Decorate". Proof: `npx vitest run tests/ladder.test.ts tests/ui.test.tsx`, `npm run smoke`
  (checks the tab titles).
- **New players climb an unlock ladder, and unlocks are earned.** `src/state/ladder.ts` (pure) opens tabs and panels as
  progress grows. Going somewhere (a button that names a tab, a building tap) shows that tab while the player is there but
  never opens it for good; only ⋯ → Show everything does (`opened`; it also turns Simple mode off). Findings are held until city care unlocks (a linked account sees them at once),
  then drip in least severe first, at most `MAX_OPEN_FINDINGS` open; hardware-choice advice (`ADVANCED_RULES`: Graviton,
  previous generation, gp2) waits until a quest is finished and comes last. AWS news (the ticker and incident toasts) is a rung too:
  it opens after the first quest, and the demo's practice drill waits for it (`MockBackend.putProgress`); storms still show.
  There's no "Open anyway" list: the shift's "Coming up next" names the next unlock and how to earn it.
  Proof: `npx vitest run tests/ladder.test.ts tests/finding-pacing.test.ts tests/contract.test.ts`.
- **Simple by default** (`prefs.simple`, absent = on; `src/state/simple.ts`). Every surface asks `shows(feature, prefs, ctx)`:
  Home, the HUD, the tabs and the Drawing board (`App.tsx`), My City (`Collection.tsx`), the news ticker, the toasts
  (`discoverCombo`, `watchBadges`), City care's release (`careUnlocked` in `src/app/runtime.ts`) and the city's courier
  hint, blueprint card and rush-hour surge (`CityScene`). Simple's City tab is one To-do list (`buildTodo`: the next
  action, today's goals and the order board's jobs, deduped by key, at most `TODO_MAX` 5, each a box, one line why and one
  button that says what happens; "To do n/m" counts today's goals, then "Done for today. Come back tomorrow: N cards
  ready"; while a quest step is open the day can't read done before `DAY_MIN_DONE` 2 goals are ticked, so a first day
  is the step plus one goal); a walk run from a game, an HQ or the world map goes back to the city first (`walkTo`,
  `walkToStation`); in the city, Simple drops the islands' "AWS trouble" labels and the drill's citizen talk, and the
  "E · Visit X" hint goes once its step is done; the HUD is ⭐ · coins · To do · Decorate · ⋯; tabs City · Learn · Jobs, Deploy only for a deploy step, a linked
  account or a change waiting for approval; Learn hides the Drawing board (a design step shows it); City care waits for a
  finished quest; My City is buildings, stars and coins. Hidden, never deleted: badges, combos, coins, the season road and
  the shift keep recording, and ⋯ → Show everything / Keep it simple switches back and forth with nothing lost. The tour's
  second step points at the list. Proof: `npx vitest run tests/simple.test.ts tests/simple-ui.test.tsx tests/session.test.ts`, `npm run smoke`
  (runs Simple first: `01s-simple-first-city`, `80-simple-home`, `80b-simple-task-ticked`, `80c-simple-day-done`,
  `80d-simple-panel`, `80e-simple-tour`; then turns Everything on for the feature checks).
- **Home is Today's shift** (with Everything on; the City tab, `src/ui/Home.tsx`): one big button from `nextAction` (`src/state/next.ts`, pure
  `planNext`: the active quest step, then ≥ `DUE_MIN` cards due, a new quest, a building one action from its next level,
  a client's job, then Connie's after-quests offers), labelled with exactly what happens ("Walk to S3 Lake", "Review 5
  cards", "Solve: Static site") and naming the tab it opens when the label doesn't ("opens Learn"); then the order board
  (3 open jobs, "Go → <station>"), Ready to upgrade, today's goals as a ring and chips, and an end-of-shift card once the
  day's own goals are done (`shiftSummary`: ⭐ by building from the device-local `shift` log, 🪙 from `Progress.wallet.log`,
  the streak, "Come back tomorrow: N cards will be ready"). Everything else is folded under More to do. Quest steps'
  buttons say what they do (`stepButton`: "Walk there", "Open cards (Learn)", "Solve it (Learn)", "Approve it in Deploy"),
  never a bare "Go"; each step done toasts a ✓ and bumps its building (`questStep` on the bus). Proof:
  `npx vitest run tests/next.test.ts tests/ui.test.tsx`, `npm run smoke` (one primary button on the shift).
- **Learning has a daily rhythm and a goal.** The shift shows Today (a few cards, a puzzle, a fix: only areas that are open;
  `todayGoals` in `src/state/progress.ts`; the day's set is fixed at its first look, `settleToday`, and areas that open
  later are bonus goals that don't move "2/3 done") and the certification the player chose in Golden Jacket Hall
  (`prefs.certGoal`, `certProgress`). Each building's sign counts its reviewed cards due again (🃏, `dueFor` in
  `src/state/srs.ts`, re-read each minute; shown with the name under the label budget). Each building's card offers "Which one should I pick?" comparisons
  (`shared/comparisons.json`, AWS decision guides as sources, `CompareCard`). ⋯ → Save a postcard downloads the city as a
  PNG with its caption (`src/game/postcard.ts`, nothing uploaded). Proof: `npx vitest run tests/comparisons.test.ts
  tests/ui-logic.test.ts tests/culture.test.ts tests/content.test.ts`.
- **Partners are linked, never copied.** Each building's card has a Learn more shelf (`src/ui/ReadingShelf.tsx`,
  `shared/further-reading.json`): a Tutorials Dojo cheat sheet for every service, AWS Fundamentals articles where they
  have them, then books credited with their authors. Links open only on the partners' hosts (`isReadingUrl`, separate
  from `openDocs`, which stays AWS-only); the extension never fetches them. Check each link opens before adding it.
  Proof: `npx vitest run tests/reading.test.ts`.
- **Quests teach in order and end with "Explain it back".** A quest's drawing only asks for services the quests taught
  before it; a cards step that due cards can't fill tops up with practice cards, which pay review stars but don't move
  the schedule (`questPracticeDeck`). The celebration card asks one question about the quest's first service; the
  player answers in their own words (≥ 6 words, ≤ 600 characters). A rules-only check shows the service's keywords they
  used and missed (`src/state/explain.ts`), and the building's agent gives kind feedback through the ordinary `chat.ask`
  route (no contract change; the demo's reply starts from `EXPLAIN_MARK`). Proof: `npx vitest run tests/explain.test.ts tests/ui.test.tsx
  tests/content.test.ts tests/learning.test.ts`.
- **Each mini-game has an Expert round from building level 3** (`EXPERT_TIER`, `src/game/pace.ts`): quicker (`EXPERT_PACE`),
  quiz games deal only the two harder tiers (`dealRound`), stars × 1.5; it ends when the player leaves the game and never
  mixes with Games without a clock. Proof: `npx vitest run tests/a11y-prefs.test.ts`.
- **One goal, one celebration.** The City tab has one primary button (the shift's next action, or in Simple the first task still
  to do; nothing competes on a first run's world map). A big moment gets one channel: a tier-up celebrates on the building (no toast), a finished quest opens the
  celebration card (`src/ui/Celebrate.tsx`, no toast). While that card or a mini-game is up, info toasts (badges, AWS
  status, a drill) wait and come one by one after it closes (`toastsHeld` in `src/state/store.ts`; errors still show), the
  ticker hides during the card, and the card's backdrop stops the presses Phaser hears on the window (`useShieldGame`).
  AWS status leads with plain words (`plainIncidentLead`: "Practice storm: nothing is wrong with your city"). A golden
  token's bubble is short and gold ("✨ Golden token! 1 of 6 · +5 points", no exam code) and waits for a tier-up's cheer;
  bubbles stay below the ticker (`setBubbleTopInset`). Players see stars (⭐) for knowledge and City Coins (🪙) to spend, never "XP".
  Proof: `npx vitest run tests/moments.test.ts tests/incidents.test.ts tests/tokens.test.ts tests/ui.test.tsx`.
- **Each Region is its own city** (contract v2.7, `src/state/cities.ts`). Landmarks live in `Progress.cities[region]`;
  global services (`shared/region-facts.json` `global`) stay in `Progress.landmarks` and stand in every city. Knowledge
  (cards, quests, puzzles, citizens, streak) follows the player. Old saves migrate into the city being built. Selectors
  take the Region (`isDiscovered(p, id, region)`); without one they mean "anywhere". Your real resources stand where they
  live (`src/world/resources.ts`, `shared/resource-props.json`): servers on their AZ's island, buckets on the lake.
  Proof: `npx vitest run tests/cities.test.ts tests/resources.test.ts`, `cd server && npx vitest run test/progress.test.ts`.
- **Plain language.** Player-facing text goes through `<Plain>` (`src/ui/Term.tsx`): every glossary term and service
  name can be tapped for its definition. Every acronym a player reads is a glossary term, a service name or on the allow-list.
  Simple words first: every flashcard has `simple` (≤ 110 chars), every puzzle `simpleWhy`, every service `simple` (≤ 90);
  the full text sits behind "Tell me more" / "For AWS learners" (so do a drawing's pillar meters and best-practice ids, and
  a practice build's real cost: the demo says "Practice: free, nothing is created"). A flashcard's question only marks its
  terms (`still`: a tap anywhere flips it); the answer side repeats the question with tappable terms. "Learned" means known
  (`isKnown`: Knew it/Easy, not "Didn't know"). Proof: `npx vitest run tests/content.test.ts tests/ui.test.tsx tests/ui-logic.test.ts`.
- **The map stays calm.** Labels follow one budget (`src/game/labels.ts`, colours in `src/game/theme.ts`): names on hover or
  zoom ≥ 2, technical labels (AZ IDs, network notes, distance signs) only with ⋯ → Show the map details (`prefs.mapDetails`).
  Every issue cone shows, but only the most urgent one's "!" tag (and it alone bounces); the rest show from zoom 2 or on the
  building the player is looking at (`IssueMarkers.setTagsShown`). The ticker leads with this city's Region; a weeks-old
  outage elsewhere waits behind fresh news (`tickerItems`). Proof: `npx vitest run tests/incidents.test.ts tests/ui.test.tsx`,
  `npm run smoke` (screenshots in `.output/smoke`).
- **The skyline grows with what you learn, block by block.** On a real map every free build tile of a block (not road,
  sidewalk, front row, work spot, footprint, water, park, superblock or decor) is infill (`src/game/infill.ts`, pure): cut
  into near-square segments (|w − h| ≤ 1, at most 3×4, so one `footprintDepth` orders each) of brownstones, walk-ups,
  lofts, pre-war blocks, slabs and setback towers (`art/tiles/infill.json`, style `infillStyle` per Region in
  `shared/region-flavour.json`). A building's height class is the lowest of the real density (`plan.density`), its
  district's level (locked: low-rise behind hoardings, walk-ups where density ≥ 2, never above mid; Novice mid,
  Practitioner high, Expert/Master sky; neighbourhoods follow density alone) and the clear ground behind each of its tiles (`clearBehind` with `CLEAR_BAND` 3, `CLEAR_MARGIN`
  1, 8 px a step; the AZ islands count), so it never hides a landmark. Street trees on every third sidewalk tile,
  signals at avenue corners (`signalPhase`, ambience only), plain parked cars on avenue kerbs (≤ 48, 24 in the panel).
  Variety by hash: each segment has a dominant kind with accents, a quarter take the other style, shops on block
  corners, ~1 in 8 big segments keep a courtyard garden; an open district's open lots stay pocket parks.
  `src/game/InfillLayer.ts` composes each segment into one frame on ≤ 2 canvas pages (1 in the panel; a CanvasTexture
  re-uploads itself after a lost context), one Image + one lights Image per segment. Lights sit in the top @lights layer
  (70,001, over the night overlay) and are composed occluded: cut by later buildings in the segment, nearer segments'
  buildings, landmarks in front (`setFronts`) and street trees/signals, re-composed when any of those change. Segments
  fade in front of Kai through their alpha mask, and only segments that changed are composed again. The legacy city
  keeps its district towers (`decorPlan`, `TOWER_STEPS`). Proof: `npx vitest run tests/infill.test.ts tests/decor.test.ts
  tests/depth.test.ts tests/plan-snapshot.test.ts`; `npm run smoke` (infill segments drawn, ≤ 1,800 objects drawn at
  zoom 1, ≤ 3,600 aimed / 4,500 fails, a lost WebGL context restored without errors).
- **Every Region's city has its own landmark.** `shared/region-flavour.json` gives each Region a `signature` (13 motifs ×
  variants, `art/tiles/signatures_art.py`: lattice tower, needle, bridge, spire, dome, gate, pavilion, rowhouses, wind
  towers, data-centre campus, shell roofs, harbour towers, modernist gallery), placed once by the highway outside the gate
  (`terrainFor`, no `rng()` calls so nothing else moves). Generic impressions only: no trademarked or protected buildings,
  flags, religious, political or military sites. The one brand allowed is Amazon Air (the airport hub's name and the
  jets' "PRIME AIR" livery), the player's choice, behind one switch: `shared/brand.json` `amazon` (`src/world/brand.ts`
  `branded`); a store build sets it to false and the generic names (`nameUnbranded`, "AIR CARGO") show. The world map draws each city's signature as a tiny skyline, lit while
  it's night there (`isNightAt`, solar time from the longitude, redrawn each minute). Proof: `npx vitest run tests/signatures.test.ts`.
- **Learning visibly grows the city.** Every activity names the building it grew and how far (`growthOf`/`growthLine`,
  `src/state/growth.ts`): under each flashcard, on every game's end card, in the puzzle result. Each landmark grows a
  **knowledge tower** shaped by its service on the back of its lot: `tw_<id>` beside its front building `lm_<id>` in
  `art/tiles/services/<district>.py` (collected by `services.REGISTRY`; no generic fallback), composed by
  `art/tiles/growth_art.py` (none at Novice, mid-rise, tower, skyscraper at Master ending in a thin tip on the lot's centre
  line, where the crowns stand; the front building keeps its metaphor, so a lake stays a lake). District HQs are
  `art/tiles/services/hq.py`. The generator refuses a tip off the centre line and writes `art/tiles/report.json` (tips;
  each district's worst Master-skyline overlap, IoU < 0.8); the empty sky above every `lm:*` sprite is trimmed. A tier-up rises floor by floor (`Landmark.rise`, inside the one
  celebration), buildings in front of Kai or the picked building fade (`src/game/occlusion.ts`), and the camera frames a
  tall building by its middle without losing its ground (`buildingFocusY`, `src/game/camera.ts`). Between levels a building
  shows scaffolding (1/3 of the way) then a crane (2/3) (`constructionStage`, `TierProps.syncWorks`); a tier-up flies the
  camera there, and one earned while the city slept (game, HQ, world map) is celebrated on return. Drawings pay most
  (`src/learning/puzzleRewards.ts`: first pass 12/service + 10, better pass 4, a failed try 2 per right piece once a day);
  a puzzle's `best` is its best *pass* only, and the panel states the rule (70+, nothing missing). Games pay full stars
  for 3 rounds a day per game or a new best (`gameStars.ts`); a game with calls has a `minAccuracy` (`shared/minigames.json`)
  below which there's no New best and a third of the stars. One daily ledger, kept on the device for the local day
  (`src/learning/dailyLedger.ts`), limits game rounds, puzzle tries, drawing-board designs (they pay coins; their own learning kind, `designs`,
  not a Today goal), Lookout pages (each service once a day), chat answers (3 a building, 10 in all) and tasks (3 a
  building, then 0); workshop steps pay once per mode, so they're not on it. Again pays 0⭐, and a seen card never pays new-card stars again. District skylines average the buildings put up
  (at least 2). Proof: `npx vitest run tests/puzzle-rewards.test.ts tests/park.test.ts tests/game-clock.test.ts
  tests/learning.test.ts tests/minigames.test.ts tests/workshops.test.ts tests/daily-pay.test.ts tests/decor.test.ts tests/art.test.ts
  tests/occlusion.test.ts tests/camera.test.ts`; `npm run smoke` checks a fully known S3 Lake reads Level 7 and audits the citizen question.
- **Past Master, crowns come from knowledge, not stars** (`src/state/mastery.ts`): Lv 5–7 (`tiers.legend` in
  `shared/world.json`: Mentor, Architect, Legend) need cards remembered for a week (`MASTERED_DAYS`; the first time pays
  `REMEMBERED_STARS` 6⭐, once per card, kept as `CardState.remembered`, contract v2.12, even after an Again), a passed drawing
  that uses the service, a finished quest and rounds of its game. Gold crowns stand on the tower's tip
  (`art/tiles/legend_art.py`; the Legend's beam is night-lights only) and the sign stands above them; the building card
  lists the next crown's steps. Proof: `npx vitest run tests/mastery.test.ts tests/learning.test.ts tests/art.test.ts`.
- **Walking counts.** A quest's visit step counts when Kai *arrives* (`store.arrive`, from `goTo`'s callback or stepping
  on the work spot), not on a tap; "Walk there", "Walk to <place>" and the tour walk him there (`src/state/walk.ts` `walkTo`), and a city that
  can't (asleep behind a game or HQ) counts it at once, so a quest never sticks. Now and then one existing citizen has a
  question (`src/state/requests.ts`, `src/game/Requests.ts`: a gold "?", at most 5 a day, no new walkers): reaching them
  opens `RequestCard`, an ordinary flashcard review plus a 2⭐ thank-you; the "?" stays until it's answered, and only
  answers count toward the five. Open park rides are ridden (no stars). Six
  golden tokens hide on each city's streets (`src/world/tokens.ts`, hashed placement, no `rng()`), glint within 4
  tiles and are kept in `Progress.finds` (contract v2.9, union merge, earliest date). Mini-games count toward Today and
  the streak, and S3 fishing pays once a round under the daily rule (`fishingStars`). Proof: `npx vitest run
  tests/session.test.ts tests/requests.test.ts tests/tokens.test.ts tests/park.test.ts tests/game-clock.test.ts
  tests/ui-logic.test.ts tests/ui.test.tsx tests/contract.test.ts`, `cd server && npx vitest run test/progress.test.ts`.
- **re:Play Park.** An AWS theme park on a 6×5 site the terrain reserves outside the gate in every Region (`terrain.park`,
  no `rng()`); `src/world/park.ts` lays out six rides (EventBridge wheel, Lambda coaster, CloudFront drop tower, Route 53
  carousel, S3 flume, SQS teacups), each open when its building reaches Practitioner in this city, else under wraps
  with a hint (`src/game/Park.ts`; tap opens the building). Pocket parks stand on the lots global services leave open
  (`openLots`). Sprites: `art/tiles/park_art.py` (+ `crane1x1`, `scaffold1x1`). Proof: `npx vitest run tests/park.test.ts`.
- **`npm start` is calm, and works from a fresh clone.** `scripts/launcher/boot.mjs` uses only Node built-ins: it checks
  Node, runs `npm ci` when `node_modules` is missing, half-installed or older than `package-lock.json` (`depsPlan`; log in
  `.cache/npm-install.log`), then imports `start.mjs`; `npm run live` goes through it as `--live`. Every run prints the
  still AWS City scene (`printScene`: title, night skyline, moon, bay and bridge when wide; no road, no cars, no fireworks,
  one fixed moment `STILL_T`), centred, above the panel; `sceneLayout` keeps `panelReserve` rows for the panel, a resize
  reprints it, and a terminal too short for both gets the header's one-line skyline (`miniSkyline`, `stepsGrowth`). The
  panel (`scripts/launcher/panel.mjs`, `renderPanel`) is drawn in place, never full screen: a header, a ✓/spinner/✗
  checklist with times, one status line, the keys; plain lines without a TTY or in CI. The intro (`playIntro`: the title
  wipes in with its glow, the city rises floor by floor, no cars or fireworks) plays every run in `INTRO_SECONDS` (2 s, ~30 fps, drawn in
  place with the cursor hidden; any key skips) and ends on the exact still picture (`STILL_T`); `--no-intro` skips it (`introPlays`).
  The scene and the panel sit at the left edge at every width (`sceneLayout` has no offset). Later runs say "Play again?" (`startPlan`), and the build is
  skipped when `sourceStamp` (`src/`, `shared/`, `public/`, config, WXT env) matches `.cache/launcher.json` (`--rebuild`).
  A window already holding the browser profile is named (`lockPid`, `ALREADY_OPEN`, `k` closes it). Proof:
  `npx vitest run tests/launcher.test.ts tests/launcher-skyline.test.ts`.
- **Hands-on workshops, step by step** (contract v2.10, `shared/workshops.json`, `src/ui/Workshop.tsx`). Each step is a
  command for the practice terminal (`src/learning/terminal.ts`: shell-style parsing, flags in any order, `<placeholders>`,
  the real CLI's other spellings (`sameAsCli`: `./file`, a copy to `s3://bucket` or `s3://bucket/` keeps the file name as
  its key), Hint never stops at a placeholder (`hintWord`: asked again there it types an example name), taught errors with
  the real CLI text; nothing touches AWS) or AWS CloudShell, where `workshop.verify` checks it with a
  read-only look at the poller's snapshot (`server/src/workshops/checks.ts`: a fixed registry, no SDK calls of its own, no
  new IAM). Pasted errors match the step's known ones first, then go to the building's agent as quoted, redacted data.
  Steps pay stars once per mode, ever (`src/learning/workshopRewards.ts`, real > practice; no daily ledger, so a
  workshop done in one sitting pays in full). The terminal helps like a shell: Tab finishes a word, ↑ recalls lines,
  💡 Hint types the next word for −1⭐ on that step (a paying step still pays one), and Fill my names swaps `<table>` for
  the name used earlier; names and lines are remembered per workshop (`prefs.workshopMemory`, `rememberWorkshop`). The
  demo is honest: "for real" there runs in the practice terminal and pays practice, never "real" (`honestMode`). Six
  quests have one workshop step each, and any step of that workshop counts (a step done again too, so it never sticks).
  A finished workshop gets one moment, the "Workshop complete" card (`src/ui/WorkshopDone.tsx`; store `workshopDone`
  holds toasts, its "Established" badge included, until it closes), while the city drops the "established" plaque in
  front of its building; it counts as the hands-on crown step. Text is copied from an AWS
  workshop only when its repo's licence allows it (`licenses`; `source` credits it), otherwise the steps are ours and
  link the workshop. The Town Square's Workshop Studio lists them all. Proof: `npx vitest run tests/terminal.test.ts
  tests/workshops.test.ts tests/workshop-ui.test.tsx tests/moments.test.ts tests/content.test.ts tests/contract.test.ts`,
  `cd server && npx vitest run test/workshops.test.ts test/progress.test.ts`; `npm run smoke` (Hint/Fill/Tab in sight at
  1400×880 and in the 400 px panel).
- **AWS North Hall** (campus, `shared/conference.json`, `src/ui/NorthHall.tsx`): the AWS North conference's talks in our
  own words, speakers unnamed, every fact from AWS docs (unverifiable claims dropped). Passing a talk's three questions
  grows its buildings once (`Progress.talks`, v2.10). Proof: `npx vitest run tests/conference.test.ts`.
- **Drawing → stack.** Each deploy template has real CloudFormation (`shared/templates/<id>.yaml`, cfn-lint clean): shown,
  copied or downloaded (a local Blob) in the Deploy tab and after a passed drawing (`templateForPuzzle`): every drawing has
  one, its quest's deploy step or its own `templateId`. Proof (and `cfn-lint shared/templates/*.yaml`):
  `npx vitest run tests/templates.test.ts`.
- **Security Agent and the Red Team Range.** `securityagent` takes the lot IAM leaves open in the security district (in
  the classic city a district's 7th+ service takes a global's open lot, `lotsOf`; past that it isn't placed there). Its game (`RedTeamGame`, `minigames.json` `redteam`) is
  a pen test of your own app on screen: flag the flawed requests, let the fine ones pass. The city never sends traffic
  anywhere. Region facts come from its own Regions page (`pageOnly` override; an unlisted Region is `not-listed`).
  Proof: `npx vitest run tests/taxonomy.test.ts tests/region-facts.test.ts tests/minigames.test.ts`.
- **The airport grows with learning** (`src/world/airport.ts`, `src/game/Airport.ts`). Runway and tower outside the gate
  in every Region with room. Its level (0 to 3, `airportLevel`) is the Amazon Air hub's City Clients level, with the old
  rule as a floor (3 Practitioner buildings: level 1, the terminal; 6: level 2, the hangar); level 3 comes only from the
  hub's jobs. Each level swaps the `air:*` sprites in the same slots. Each level-up (and each hub level) flies in a cargo
  jet (livery per `shared/brand.json`; anchored at its ground centre, gear up in the air) that lands, taxis, unloads
  crates and leaves, one at a time, none under reduced motion. Its site and the park's annex (three more rides) are placed after every other prop and clear the props
  under them, so no `rng()` draw moves. Proof: `npx vitest run tests/airport.test.ts tests/park.test.ts tests/terrain.test.ts`;
  `npm run smoke` asserts at most one cargo jet.
- **Decorate: the player decorates their own city** (build mode; contract v2.13 `Progress.decor`, rules in `src/state/buildmode.ts`,
  drawer `src/ui/BuildDrawer.tsx`, scene `src/game/BuildLayer.ts`, art `art/tiles/builder_art.py`: `deco:<kind>`, 51
  sprites, `-r` = turned, district colours as variants). The HUD's 🌳 Decorate and ⋯ → Decorate open a palette (33 items
  in 6 categories, each with a price in 🪙 City Coins and some unlocked by a badge or this city's rank); the ghost is green or red,
  R turns, Esc leaves, Ctrl/⌘+Z undoes (this session only), arrows move it and "✔ Here" builds (keyboard). Never on roads,
  water, sidewalks, buildings, work spots or the row in front of a building, nor on decor, infill or a business; only in
  open districts (pocket parks included), a real map's parks and neighbourhoods, and the Town Square's lawn ring (its
  ways in kept clear). Placed props block walkers (a grid version bump drops cached routes), and decor and infill leave
  their tiles. Caps 120 a city, 240 in all, 20 cities (the server holds the same). Decorations cost coins, never stars
  (see Currencies); removing gives half the coins back, moving is free, undo returns the coins. Prices renew as a sink
  (`priceFor`): past `FREE_COPIES` of one item a city each copy costs `COPY_STEP` more, past `CROWD_FREE` props every one
  costs `CROWD_STEP` more; a crate item not won yet is bought for good by placing it (`MARKET_PRICE`, `drops.bought`;
  monuments stay earned-only); crate spares raise a reward's per-city cap. v2.16: a city merges prop by prop (`gone`
  tombstones, `mergeDecor`; a pre-v2.16 copy without `gone` still merges newer-wins) and undo touches only its step's
  prop (`UndoStep.prop`). While building, one invisible sheet takes every tap and nothing
  auto-pans the camera. Proof: `npx vitest run tests/buildmode.test.ts tests/build-ui.test.tsx tests/art.test.ts`,
  `cd server && npx vitest run test/progress.test.ts`; `npm run smoke` places three by clicking in the tab and the panel
  (`58-build-mode*.png`, axe on the drawer).
- **Currencies: ⭐ is knowledge, 🪙 is what you spend** (contract v2.14 `Progress.wallet {earned, spent, log?, refunded?, shift?}`,
  `src/state/wallet.ts`). Stars only grow buildings and are never spent. City Coins are earned by doing things and spent in
  Decorate (later combos and cosmetics). Pay (`COIN_PAY`): a side job 15 (once ever) + 40 when its level finishes, a
  scoring mini-game round 6 (3 for the next `HALF_ROUNDS_A_DAY` 10 after a game's first 3 rounds a day, then 0, unless a new best;
  `roundCoins`; Launch Day too; relaxed rounds of a game with an accuracy floor need `RELAXED_MIN_CALLS` calls), a Watch-it-done
  repeat whose stars are used up 2 (`COIN_PAY.watch`, 5 a day), a workshop step that
  pays stars 5, each service on a passing drawing-board design 5 (once a day per service, at most 8), finishing the day's
  shift 30 (once a day: Home calls `payShift` when the shift is done, and `wallet.shift` remembers the day across surfaces). A casual session (shift + 2 rounds + a job ≈ 57) buys a
  decoration (most cost 4–30; the 2×2 landmarks 50–80 are worth saving for). Both counters only go up (a refund adds to
  `earned`), so a merge takes the higher of each (coins earned on two surfaces in the same instant count once); `log`
  keeps 14 days for "today" lines. Decorations bought with stars before v2.14 (`CityDecor.spent`) are refunded once as
  coins on load (`migrateWallet`; v2.16 `refundedBy` counts it per city, so an old client buying in one city is refunded those). The store's API: `earnCoins(n, reason)`,
  `spendCoins(n)`, selectors `coins(p)`, `coinsToday(p, day)`. The panel draws a coin as a pixel icon (`Coin`, `withCoins` in
  `src/ui/icons.tsx`; `Plain` swaps any 🪙 the state layer writes), never the emoji, which is a grey ball without a colour
  emoji font. The HUD shows only ⭐ · coins · 💡 (City Lights), the rank chip, a one-time "spend them in Decorate" note
  under the coins and 🚦 Rush hour while it runs (`src/game/rush.ts`); citizens'
  meters count 🎓 lessons, not stars. Where pay halves or stops (game rounds, chat answers, agent tasks), the card says
  so kindly ("full stars again tomorrow"). Golden tokens are ✨, never 🪙. Proof: `npx vitest run tests/wallet.test.ts
  tests/wallet-store.test.ts tests/buildmode.test.ts tests/build-ui.test.tsx tests/contract.test.ts`, `cd server && npx
  vitest run test/progress.test.ts`.
- **Agent tasks are "Watch it done"** (`src/state/watch.ts`, `TaskCard` and `AgentOffer` in `src/ui/ActivityFeed.tsx`).
  Before the agent works, the card frames a little story ("Sally will store your holiday photos in S3 Lake. Watch Sally
  walk there.") with 👀 Watch (the camera follows the agent: `flyTo` `agent:<id>`; the card folds to one live step, the
  walk there included, the same step the canvas bubble shows);
  during, its steps mirror the city (the demo plans every step it runs, the helper's visit included); after, what was
  built, what it teaches in one line, what it paid (or the daily-cap line: `TaskView.paid`/`capped`), the next step
  (`nextAction`) and, in the demo when a task matches a practice template, 🏗️ See it in Deploy (`planDeploy`, link first
  if needed; Home passes `openTab` so it opens Deploy). Home's agent offer is the same `AgentOffer`, and each featured
  request's words route to the agent offering it (`FEATURED_REQUESTS`, `matchText`). A building card separates 💬 Ask a question (the HQ chat) from 🛠️ Watch it done (an agent task, whose TaskCard then shows on that same card, scrolled into view). Its sign's marks are said in words there (`signLegend`: ×N resources, ! N things to check). Proof:
  `npx vitest run tests/watch.test.ts tests/watch-ui.test.tsx tests/taxonomy.test.ts`; `npm run smoke` (`03`–`06-task-*.png`).
- **City Clients: side jobs for real kinds of business** (`shared/clients.json`, `src/world/clients.ts`, `src/ui/clients/`).
  18 businesses: wave 1 (Amazon Air hub, bank, stadium, hospital, shop, school) and wave 2 (streaming studio, game studio,
  news site, port, energy utility, factory, farm co-op, car maker, phone network, town council, hotel, charity), three
  levels of 4 to 6 jobs; facts only from each business's fetched AWS pages or cited flashcards, source titles name no
  customer, and every CLI error text is checked against the AWS API reference or the aws-cli source (missing flags print
  `aws: [ERROR]: An error occurred (ParamValidation): the following arguments are required: …`, `src/learning/terminal.ts`). A job is done at a named station of the business's site (Kai walks
  there with `walkToStation`, the job opens on arrival; a ring site is reached at the city gate, a sleeping city opens it
  at once) and reuses a part: the architecture board (`Builder` with `job`, `src/learning/jobPuzzle.ts`; never
  `Progress.puzzles`), the practice terminal, a choose card, the practice console's Copilot, a settings checklist,
  Explain it back (`checkKeywords`), or one of 7 station panels (`src/learning/stations/`: sort, match, route, rotate,
  scale, spot, order; pure reducers, buttons for keyboard and pointer, Games without a clock drops the timer). The ladder
  opens Clients after the first quest; a job whose services aren't put up here says "Put up <X> first" and how (its
  Show me flies there; learning one of its cards puts it up) and never blocks the rest of the level. One station job is a
  `starter` (stadium "Sort the fans' requests"): open from day one in every city, with nothing put up (`missingFor`,
  `STARTER_TASKS`; doing it puts its buildings up). A job pays its services once ever (`completeTask`, `Progress.clients`
  v2.13: higher level, union of done, earliest date); a level's last job pays its bonus, opens one card (`clientDone`,
  `toastsHeld`) and grows the site (`clientLevelUp`: the next `client:<id>:<level>` sprite, a bump and confetti). Sites
  are placed without `rng()`: the airport hub on the airport, the rest inside a real map's core (`hoodLots`, the art's
  size: bank and shop 3×3, the rest 4×4; wave 1 chooses first (`waveOf`), then big lots): neighbourhood blocks first, then the quiet back of a
  district block (never a landmark's lot or the tile round it, its front row or work spot, a pocket-park lot, the square,
  campus, Day 1 Quarter, road, sidewalk or water; infill leaves them; stations never on water). Every real city stands
  wave 1 inside (us-west-2 included) and as many of wave 2 as fit (5 to 17); the rest take the ring's lots
  (`terrain.clientLots`, up to 17 aims beside the highway, after every other site), as all 17 do in the classic city. An
  empty site (level 0) shows a "coming soon" `lotSign`. Yellow "!" markers (map and minimap) show the
  focused business's open stations. `Progress.decor` (v2.13, per city, newest copy wins) is defined for build mode.
  Proof: `npx vitest run tests/clients.test.ts tests/clients-ui.test.tsx tests/stations.test.ts tests/stations-ui.test.tsx
  tests/airport.test.ts tests/ladder.test.ts tests/contract.test.ts tests/plan-snapshot.test.ts`, `cd server && npx vitest
  run test/progress.test.ts`; `npm run smoke` (section 70–77: one job of every kind in Montreal, a level done, axe; 85 a
  wave 2 business: the port's jobs and its empty site).
- **You're the Mayor; your city has a rank** (`src/state/rank.ts`: building levels and golden tokens → Village, Town, City,
  Metropolis, Megacity, Global City at 60/250/700/1400/2200 points; `presence.beat` sends the name, v2.12). The HUD's rank chip opens **My City** (`src/ui/Collection.tsx`), the one progress hub: ⭐ · 🪙 · 💡 · 👑 crowns, the rank ladder, badges, the live city (👥), the loops below (`src/ui/Loops.tsx`), collections, and you
  beside AWS at scale. Badges are read from Progress (`src/state/badges.ts`); only moment badges are stored
  (`Progress.badges`, v2.11), and a new one is celebrated once (`watchBadges`). Rank flags stand round the Console
  Plaza. The shift always has a next step (`src/state/next.ts`: never a fenced lot, "Upgrade" only when the deck can pay
  now, "Review N" counts the deck it opens), 3–5 goals (`todayGoals`: the order board feeds a job goal, `SHIFT_MAX`) and
  an optional overtime goal once done, a workshop goal in Today, a weekly challenge game paying
  ×1.5 (`src/state/events.ts`, the ISO week), and one streak freeze a week (`nextStreak`). Proof:
  `npx vitest run tests/rank.test.ts tests/events.test.ts tests/streak.test.ts tests/next.test.ts`.
- **Loops that bring you back are earned, cosmetic, free and never decay** (contract v2.15, `Progress.lights`/`seasons`/
  `drops`/`codex`; `src/state/{lights,season,drops,codex,cosmetics,rewards,cityhall,welcome}.ts`, all pure; store actions
  `lightDay`, `fillSeason`, `claimSeason`, `openDrop`, `discoverCombo`). **City Lights** replaces the streak display (HUD 💡,
  Home, City health): each learning day (`noteLearning`) lights a window for good; a missed day dims one until a learning
  day relights it; a freeze is earned every 7 learning days (3 held at most) and covers a missed day (v2.16 counters
  `freezesEarned`/`freezesUsed`, merged max/max, so no freeze is lost between surfaces); `nextStreak` stays for badges. At night the windows glow on the city's buildings (CityScene's `// ── Juice (round 3 step 2)` block, solid pixels
  only, colour `prefs.glow`). A finished shift opens one **Daily Supply Drop** a day (a decoration or a window colour only,
  free, the real chances for what's left shown before opening (`dropOdds`), never a cosmetic owned from any source
  (`ownedCosmetics`), a spare copy once all are owned (`MAX_SPARES`), plus a bonus crate for the shift's overtime goal
  (`overtimeGoal`, `drops.overtime`), a 1 s shake then a pop in its rarity's colour
  (none under reduced motion, `CRATE_SHAKE_MS`), never coins or stars, rolled from the day so every surface opens the same crate; its button is
  never Home's primary) and fills one **season road** once a day (12 monthly themes, 8 steps to 100 points, the last the
  season's landmark; every road is open to everyone, picked in `prefs.road` (`prefs.season` is only the art's season);
  points past a road's end flow into the next unfinished one; a freeze step with the freezes full gives a crate item). **Service Codex**: a card per
  service put up anywhere and sets in `shared/codex.json` (Serverless Starter, the six pillars, exam sets) whose monuments
  are free in Decorate (`category: 'rewards'`); combos found (S3's `syncCombos` → `discoverCombo`) pay `COIN_PAY.combo`
  once ever (quietly too, when found while the city slept). **City Hall** levels with this city's rank and opens Decorate items and past seasons, never learning. The
  **return note** is opt-in (My City), one positive line a day, no notifications. **Juice**: right answers chime a step
  higher in a run (`feel.good`, `pitchOf`), a beam runs from the card into its building (`bus` `answer`), coins fly to the
  HUD counter (`src/ui/CoinFly.tsx`, `bus` `coins`), an upgrade pushes the camera in one integer step and back, a wrong
  answer wobbles and shows the answer; none under reduced motion, sounds through `audio.ts` (captions hold).
  Proof: `npx vitest run tests/lights.test.ts tests/season.test.ts tests/drops.test.ts tests/codex.test.ts
  tests/juice.test.ts tests/loops-store.test.ts tests/loops-ui.test.tsx tests/buildmode.test.ts tests/contract.test.ts
  tests/wallet.test.ts tests/welcome.test.ts tests/next.test.ts`,
  `cd server && npx vitest run test/progress.test.ts`; `npm run smoke` (43–46: night City Lights, season road, Codex, crate).
- **The live city and leaderboards are opt-in and name nobody** (contract v2.11). A game's board gets this ISO week's
  best timed round only (v2.12 `Progress.games` `bestTimed`/`bestWeek`, the UTC ISO week the server's boards use:
  `isoWeekUtc`; relaxed rounds never count; `scored` counts rounds above 0 for the crown). `Progress.profile` is off by default; its
  name is two generated words (`src/state/names.ts`), never typed. Presence rows (90 s) and weekly board rows (9 weeks)
  live in the player table under a salted hash (`server/src/social.ts`, `store/social-dynamo.ts`), only public profiles
  are named, scores are clamped and best-of-week, and going private or `DELETE /me` removes every row. Visiting Mayors
  walk your streets in a crowd-size gold jacket inside the crowd cap (`src/game/Visitors.ts`). The demo plays a labelled
  practice version. Proof: `cd server && npx vitest run test/social.test.ts test/hosted.test.ts test/progress.test.ts`,
  `npx vitest run tests/contract.test.ts tests/learning.test.ts tests/events.test.ts`.
- **AWS at scale comes from AWS's pages** (`npm run aws-catalog` → `shared/aws-catalog.json`: "over 200 AWS services",
  the edge network; Regions and AZs from region facts), each fact with its source (`src/world/scale.ts`). Proof:
  `npx vitest run tests/scale.test.ts`.
- **Well-Architected, cited.** Every rule and every drawing tip names its best practice (`bp`, read from the framework
  pages), every drawing links its AWS reference architecture, and City care has a Well-Architected review of the
  account (`src/state/review.ts`, `src/ui/WaReview.tsx`; "no issue found", never "passed"). Proof:
  `npx vitest run tests/wa-bp.test.ts tests/review.test.ts`, `cd server && npx vitest run test/care.test.ts`.
- **The Drawing board** (Learn → Drawing board, once "the sandbox", `src/ui/diagram/Sandbox.tsx`): an intro card (a blank
  page for your own ideas, where Puzzles give you a brief) and a short first-time guide in the buttons' own words (➜ Draw an
  arrow), one live hint line; official icons of the services you've put
  up, AWS group boxes, arrows you draw; a rules-only review of what's drawn and how it's wired, each finding with a
  verified best practice (`src/learning/designRules.ts`, `bp()` looks ids up in the data). It passes with 3+ services wired
  by 2+ arrows, every arrow the way requests travel (`backwardArrows`: against every `shared/flows.json` flow that has the
  pair; queues, topics, buses and streams go both ways), and nothing red; the verdict shows beside the button and what's
  missing comes first (`passGaps`). A pass pays City Coins (never ⭐),
  counts a quest's `design` step (Draw It Once, Build It Anywhere) and the Today chip "Draw a design" (always a bonus,
  never the finish line).
  Designs sync (`Progress.designs`, 20 at most); PNG/SVG export inlines the icons and stays local. Proof: `npx vitest run
  tests/design-rules.test.ts tests/watch-ui.test.tsx tests/ui-logic.test.ts tests/next.test.ts`; `npm run smoke` (`39a-drawing-board-intro.png`).
- **Launch Day, the builder game** (`src/learning/launch.ts`, `src/ui/launch/LaunchDay.tsx`, `shared/launch.json`): build a
  stack within a budget from the services you've put up, then live through a launch (rush, viral moment, a dark AZ, a bot
  flood). Pure and deterministic; every part's behaviour cites its AWS page, every loss names the part and best practice
  that would have held, and serving bots costs score (they're billed). Days open with Practitioner buildings. Proof:
  `npx vitest run tests/launch.test.ts`.
- **Each service has workers on the street.** Every discovered service in the city sends a worker dressed as its agent
  (crowd copy) on errands between its building and the services it works with in `shared/flows.json`; tapping one opens
  the building and shares a tip from that service's deck (`src/game/Workers.ts`, no model calls from walking). They
  take pedestrians' places, so the crowd cap holds (`WORKER_CAP` 8/4). Proof: `npm run smoke` (caps).
- **People stand to scale.** Pedestrians and the Well-Architected citizens use 3/4-size crowd sheets (`<id>-crowd`, 36×54,
  made by `art/characters/crowd_small.py` in `npm run art`, never shrunk at runtime: that would drop pixels at zoom 1). Kai
  and the landmark agents stay full size so they can be found. Proof: `npx vitest run tests/art.test.ts`.
- **Accessibility is a setting, not a fork.** ⋯ → Accessibility sets text size (125/150 %), high contrast and an easy-read
  font on `<html>` (`data-text`, `data-contrast`, `data-font`); `styles/22-access.css` only overrides tokens, and the city's
  labels scale with the text size. Games without a clock (`prefs.relaxed`, `src/game/pace.ts`) end rounds on Done and stretch
  reaction windows and spawns (Rush Hour's day, which is the game, runs at half speed instead); Sound captions
  (`prefs.captions`) show a word pill for each meaningful sound (`CAPTIONS` in `src/game/audio.ts`, not steps or blips).
  Keyboard: arrows walk, E talks, `]` / `[` step through buildings (announced to screen readers), `+` / `−` zoom. Keys go
  to the canvas when a game or the city starts, unless the player is in the UI (`keysBelongToUi`, `mayFocusGame`,
  `src/game/keys.ts`).
  Arriving in a city announces its summary (`citySummary`: buildings, issues, AWS status, live traffic). The smoke runs
  axe-core (WCAG 2.2 AA) on the world map, a building's card, the tab and the panel; serious or critical violations fail it. Proof: `npx vitest run tests/a11y-prefs.test.ts tests/game-keys.test.ts`, `npm run smoke`.
- **Kai wears the team's gold jacket.** Always, everywhere (`KAI_SHEET` = the `player-gold` sheet, `src/world/culture.ts`).
  Golden Jacket Hall tracks the certification trophies (`hasGoldenJacket`: every one lit, a moment the first time). The real
  Golden Jacket recognises holders of every current AWS Certification; `shared/certifications.json` is that list.
  The Day 1 Quarter is open from the start (`ladder.ts` `day1: true`). Proof: `npx vitest run tests/ladder.test.ts tests/art.test.ts`.
- **Seven districts, 58 services.** `shared/world.json` lists the districts (the seventh, `management`, is the Civic Centre,
  south-east of the square) in their official AWS Architecture Icon category colours (Management & Governance is
  `#E7157B`, read from the icon package's category SVG). The Global Gate's four campus lots go to the global services in
  `shared/region-facts.json` `global` order (Route 53, CloudFront, IAM, Global Accelerator: add a new one last; the order
  lives in `GLOBAL` in `scripts/fetch-region-facts.mjs`). Proof: `npx vitest run tests/art.test.ts tests/taxonomy.test.ts tests/plan.test.ts`.
- **Content is data.** Districts, services, metaphors and layout live in `src/world/`. Game and UI code
  never hard-code service ids (the exceptions are `bedrock`, the default router target, and the
  mini-games, each built for one landmark: `s3` fishing, `lambda` food stall, `route53` dance, `shield` wall, `ec2` rush hour, `dynamodb` sorting office, `securityagent` red team range, `sqs` queue juggler, `iam` permission gate, `cloudfront` edge cache). Proof: `npx vitest run tests/taxonomy.test.ts` checks every service has a
  place, a landmark and a valid work spot. A service's first `consolePaths` entry is what "Open the console" opens
  (`consoleUrl`): `vpcconsole#TransitGateways:` is a hash route, `lightsail.aws.amazon.com/ls/webapp` a console on its own
  host; `matchUrl` reads both back (same test).
- **State vs moments.** Persistent state goes in the zustand store (`src/state/store.ts`); one-off
  animations and camera moves go on the bus (`src/state/bus.ts`). Scenes subscribe to both and must
  unsubscribe on both SHUTDOWN and DESTROY, because React StrictMode destroys the first game.
- **Agent animation = real AWS activity.** `agent.state working/idle` from the backend drives the
  work animation. Browsing only moves focus: the camera pans, the agent waves, and first visits
  discover landmarks. "Browsing grew it": a service's console page is a moment the player sees (a toast with the
  building's icon and its growth line, `browsedText`; the camera flies there), still 2⭐ once a minute a service, and it
  waits behind a celebration card or a game; docs pages and other sites never make it.
  Proof: `npx vitest run tests/browse-growth.test.ts`.
- **Surfaces.** The side panel (Chrome/Edge), the Firefox sidebar (same entrypoint) and the full tab at
  `/city.html` run the same app and merge progress through `storage.local`. The toolbar opens the panel, the
  sidebar, or (Safari, which has neither) the tab: `src/app/surface.ts`. With a real account the Lookout and Console
  Copilot need the panel/sidebar (they see the console tab beside it). In the demo both use the practice console inside
  the extension (`practice.html`, `src/console/practice.ts`; nothing there touches AWS) from every surface; if the
  browser wants the player's OK for the Lookout's photo it asks ("📷 Allow"), and a no reads the page's address
  instead (`lookByAddress`). Proof: `npx vitest run tests/surface.test.ts tests/practice-console.test.ts
  tests/console-clarity.test.tsx`, `npm run smoke:copilot` (8 flows on the practice console, then the demo Lookout).
- **Three browsers, one codebase.** WXT `-b firefox|safari` with `manifestVersion: 3` (WXT defaults those to MV2).
  Firefox has a fixed add-on id (its sign-in redirect is derived from it); Safari signs in through a relay page
  (no identity API). Firefox/Safari origins are random per install, so the server allows them by scheme, and a
  wildcard never authenticates by Origin alone. Proof: `npm run lint:firefox && npm run build:safari`,
  `cd server && npx vitest run test/http.test.ts -t "origins"`, `npx vitest run tests/auth.test.ts`.

## Commands

Node 24 (`engines` `>=24` in `package.json`; proof: `npm pkg get engines.node`). 24.15+ is recommended: the launcher
(`scripts/launcher/require-node.mjs`) stops below 24 and prints a one-line note on 24.0–24.14, which still works.

```
npm start         # the guided launcher: demo / real AWS / deploy (scripts/launcher/boot.mjs → scripts/start.mjs)
npm start -- --demo --browser cft   # the same, no prompts (on stage); --help lists the flags
npm run check     # tsc --noEmit && vitest run (tests/**/*.test.{ts,tsx}; React components render under jsdom)
npm run lint      # ESLint: rules of hooks + jsx-a11y (CI allows at most 10 warnings)
npm run smoke     # build + Playwright Chromium demo run; screenshots in .output/smoke; must print "no page errors"
npm run dev       # WXT dev with Chrome
npm run live      # local server with real AWS (workshop profile) + the extension wired to it
npm run dev:firefox / npm run live -- --browser firefox|safari   # other browsers
npm run lint:firefox && npm run build:safari   # Firefox (Mozilla linter, 0 errors) and Safari builds
npm run safari:xcode   # Xcode project for Safari (.cache/safari)
npm run smoke:copilot  # the 8 Console Copilot flows on the practice console (practice.html) + the demo Lookout; must print "no page errors"
cd infra && npx cdk synth -q   # hosting (must pass cdk-nag)
npm run assets    # refetch Kenney packs into .cache/ and copy the listed files into public/assets/kenney
```

## Gotchas found the hard way

- `Element.scrollIntoView()` returns a Promise in current Chromium. Never write
  `useEffect(() => el.scrollIntoView())`; use a block body instead.
- Phaser 4: in-world text is counter-scaled by camera zoom (`setUiScale`) so it stays readable in
  the 400 px side panel.
- Upstream sources: `.claude/references/cached-sources.md` (opensrc). Check them before guessing
  about WXT or Phaser behaviour.
