# SoccerShares App — Context for Claude Code

## Project overview
React Native mobile app for SoccerShares, built with Expo, targeting Euro 2028. 
This is a prototype/spike running parallel to the live SoccerShares website 
(soccershares.nl) during World Cup 2026. The website stays untouched — this is 
a separate project at C:\Users\lenna\soccershares-app, sibling folder to the 
website at C:\Users\lenna\soccershares.

## Tech stack
- Expo SDK 54, Expo Router 6 (file-based routing) — pinned to SDK 54 (Expo Go on App Store is v54)
- NativeWind (Tailwind for React Native) — installed and working
- Supabase (shared backend with the live website — same project, same database)
- TypeScript
- `react-native-worklets/plugin` in babel.config.js (required by reanimated 4.x)

## Critical safety rule
The Supabase project is SHARED with the live website, which is actively used by 
real players during the World Cup. Never:
- Change the Site URL in Supabase Auth settings
- Remove or edit existing redirect URLs (only add new ones)
- Revoke or rotate the anon key
- Run bulk test operations (e.g. password reset spam) against real user emails
Only ADD configuration, never remove/edit what the website depends on.

## Design system — IMPORTANT
The website (soccershares.nl) is the source of truth for all UI design. It's 
built with Next.js + Tailwind CSS. Before styling any new screen or component:
1. Fetch or ask for the website's page source (view-source on the relevant page)
2. Extract the exact Tailwind classes used
3. Apply the same classes via NativeWind's `className` prop — they map directly

Known design tokens already confirmed:
- Primary green: #4a7c3f (buttons), gradient banner: from #3a6b1c to #6baa28 (to-br direction)
- Font: system default (Arial/Helvetica stack on web = San Francisco on iOS automatically)
- Flags: square SVGs at https://www.soccershares.nl/flags/{code}.svg (lowercase 3-letter code), 
  rendered circular via borderRadius: 10 on a 20x20 box — NOT rectangular
- Section headers: text-sm font-semibold uppercase tracking-wide text-gray-700
- Tab bar: Home, Shares, Predictions, Leagues, Rules (in that order)
- **Country name typography** (standardised across all screens): `fontSize: 12, fontWeight: '500', color: '#1f2937'`
- **Numeric table columns** (price, shares, value, % change): `fontSize: 11, fontWeight: '500', color: '#1f2937', fontVariant: ['tabular-nums']`
- Portfolio banner: rounded-xl, shadow-sm, gradient #3a6b1c→#6baa28. IMPORTANT: do NOT use
  start={0,0} end={1,1} for the LinearGradient — that looks horizontal on wide banners. 
  Instead use onLayout to measure dimensions and compute:
    const s = width + height
    end={{ x: s / (2 * width), y: s / (2 * height) }}
  This replicates the CSS magic-corner algorithm (bg-gradient-to-br) correctly.

## Supabase schema (public tables)
Key tables: countries, holdings, matches, transactions, users, leagues, 
league_members, league_comments, match_predictions, advancement_predictions, 
price_history, active_trading_window, recalculations, recalculation_user_snapshots, 
game_settings, trading_windows.

- `countries`: id, name, code, flag_emoji, group_name, current_price, total_shares, 
  is_eliminated, eliminated_round
- `holdings`: user_id, country_id, shares, average_cost
- `matches`: id, home_country_id, away_country_id, stage, match_date, status, 
  home_score, away_score, winner_id
- `users`: id, email, display_name, balance (this is the "cash" value)
- `transactions`: user_id, country_id, type ('buy'/'sell'), shares, price_per_share, 
  total_amount, created_at
- `active_trading_window`: presence of any row = market is OPEN; empty = CLOSED
- `price_history`: country_id, price, floor, recorded_at — `floor` is the minimum 
  share price for that recalculation; used both for the PriceModal chart and to 
  detect eliminated countries (current_price <= floor)
- `recalculation_user_snapshots`: investment_pnl (shares profit/loss), 
  cumulative_prediction_income (points earned) — used for the portfolio banner subtitles

## Business logic — replicated from website (web app source: src/app/shares/page.tsx on the website repo)
- **% price change**: compare current_price to the second-most-recent price_history 
  entry (the most recent entry already equals current_price)
- **Playing Next matches**: group matches by US Pacific calendar day 
  (`new Date(matchDate - 8hrs).toISOString().slice(0,10)`), show only matches on 
  the same Pacific day as the next upcoming match. NOT simply "next 24 hours" or 
  "today in UTC."
- **Market status**: derived from whether any row exists in `active_trading_window`
- **Eliminated countries**: a country is classified as eliminated when 
  `current_price <= price_history.floor` (most recent floor entry per country, 
  fetched alongside the price trend query). Do NOT use the `is_eliminated` column 
  on the `countries` table — the app ignores it entirely.

## Current build status

### Auth screens (`src/app/(auth)/`)
- **Login** (`login.tsx`): pixel-matched to website. "Forgot password?" navigates to /forgot-password.
- **Register** (`register.tsx`): pixel-matched to website. Display name + email + password fields with
  show/hide eye toggle. Checks display name uniqueness against `users` table before calling signUp.
  Uses `Linking.createURL('/')` as emailRedirectTo. Shows email-sent confirmation state after submit.
- **Forgot password** (`forgot-password.tsx`): email field → `supabase.auth.resetPasswordForEmail` with
  `Linking.createURL('/reset-password')` as redirectTo. Green success box / red error box states.
- **Reset password** (`src/app/reset-password.tsx`): handles deep-link recovery token, updates password
  via `supabase.auth.updateUser`, signs out and redirects to login.

### App screens (`src/app/(app)/`)
- **Home** (`index.tsx`): portfolio banner, market status (OPEN/CLOSED), Top 5 countries, Top Gainers/
  Losers, Upcoming Matches (next 8 since last recalc — stage badge, date/time, flags, teams, user
  prediction, user share counts), footer. All live Supabase data, pixel-matched to website.
  - **Top 5 column widths**: rank `width:24` `fontSize:10`, country `flex-1` `numberOfLines={1}`
    (truncates with …), price `width:60` right-aligned, pct `width:68` right-aligned. Font sizes:
    name `12`, price `11`, pct `11`, all `fontWeight: '500'`. `fmtPct` shows `+` only when `n > 0` — zero displays as `0,0%`.
  - **Gainers/Losers gap**: `gap-2` (8px) between the two columns — matches the R32 two-column grid gap on /predictions.
  - **Data freshness**: uses `useFocusEffect` (not `useEffect`) so the screen re-fetches every time
    the tab comes into focus — keeps share counts in Upcoming Matches current after visiting /shares.
- **Shares** (`shares.tsx`): portfolio banner, market status, My Shares (editable TextInput when OPEN,
  static when CLOSED; saves on blur — upserts holdings, inserts transaction, updates balance), Sell All
  button (OPEN only, executes immediately, no confirmation dialog), Playing Next (Pacific-day grouping,
  concurrent matches grouped under one header — same `match_date` = one header, no border between them,
  border only between different kick-off times; per-group stage badge + date/time header, "vs" aligned
  with country name start, "My prediction:" sentence below each match pair), Other Countries, Eliminated
  Countries (dimmed opacity 0.5, non-editable), Recent Transactions, footer.
  - **Eliminated detection**: `current_price <= floor` using `price_history.floor` (most recent entry).
    The `is_eliminated` DB column is intentionally ignored — do not reintroduce it.
  - **Column widths**: Country `flex-1`, Price `width:64` center, Trend `width:16` left-aligned
    (`items-start` so arrow sits flush against the price), Shares `width:64` center, Value `width:64`
    right-aligned (both header and data). Headers are explicit `style={{ width, textAlign }}` — not
    NativeWind `w-16` — so widths stay pixel-exact.
  - **Currency formatting**: `useCurrency()` from `src/lib/currency.ts` provides `format(n)` (2 dp,
    nl-NL locale) and `formatInt(n)` (0 dp). Value column uses `useIntFormat`/`fmtValue` pattern:
    compute `const useIntFormat = [...shares].some(c => value > 1000)` then pass `fmtValue` to each
    row; switches entire column to integer format when any value exceeds 1.000.
  - **Negative cash**: when a shares edit would result in negative balance, revert `sharesMap` and show
    a custom dark Modal (black overlay, `#111827` card, amber SVG warning icon, "You cannot have
    negative cash", green "Got it" button). Do NOT use `Alert.alert` — it silently fails on web.
  - **Auto A>Z sort**: Other Countries sorts alphabetically once `tournament_started` = 1 in
    `game_settings`. The manual A>Z toggle is hidden when `tournamentStarted` is true.
  - **Playing Next row font**: stage/date/time header row and "My prediction:" row use `fontSize: 10`.
  - **Shares tap-to-edit**: the Shares cell renders a `Text` element at rest (matching Price/Value
    rendering exactly). Tapping it switches to a focused `TextInput` only for the duration of editing,
    then reverts to `Text` on blur. Do NOT render `TextInput` inline always — iOS `UITextField` renders
    text differently from `UILabel` (`Text`) even at the same fontSize, causing visible size mismatch.
  - **Transactions table**: Country `flex-1`, Type `w-12`, Shares `w-10`, Price `w-16`, Total `w-20`.
- **Predictions** (`predictions.tsx`):
  - In-tournament mode (`game_settings` key `tournament_started` = 1): read-only group matches (A–L)
    with date/time, score/vs, user prediction label, points per completed match. Knockout advancement
    pick cards (R32→Winner); R32/R16/QF 2-column grid, SF/Final/Winner single column.
  - Pre-tournament mode: interactive Home/Draw/Away pill buttons → `match_predictions`. After all picks:
    R32 group standings with auto-advance checkmarks (P1/P2) and toggleable P3 (need exactly 8 total)
    → `advancement_predictions`. Knockout bracket points to website.
  - Sticky nav bar (GS/R32/R16/QF/SF/F/W) above ScrollView; tapping scrolls to section via `onLayout`.
    The nav sits OUTSIDE the ScrollView, so scroll targets use `Math.max(0, sectionY - 8)` — no large
    offset needed. The old `-60` offset caused each button to undershoot by ~60px, leaving the previous
    section's last row visible. Do not reintroduce a large negative offset.
  - **0 pts for eliminated advancement picks**: a 5th query fetches all `matches` with `stage = 'round_of_32'`
    to build `r32ParticipantIds`. A country is "group-stage eliminated" (`gsElim`) when that list is
    non-empty and the country is absent. `scored = is_correct !== null || (is_correct === null && gsElim)`;
    `wrong = is_correct === false || (is_correct === null && gsElim)`. Dormant (list empty) until R32
    matches exist in DB.
  - **Points styling**: group stage pts and knockout pts use the same style — `fontSize: 11, fontWeight: '500'`,
    `color: '#9ca3af'` when 0 or wrong, `color: '#374151'` otherwise. Group stage outcome label uses
    `color: '#1f2937'` (same as country names). Score between teams uses `color: '#1f2937'` when
    available, `'#6b7280'` when pending.
- **Leagues** (`leagues.tsx`):
  - League switcher: dot-separated text links (e.g. "My League • Overall leaderboard"), active tab bold
    dark, inactive gray. Tab for each user league + "Overall leaderboard" always appended.
  - Pending invites: Accept/Decline per invite (upserts league_members, updates league_invites status).
  - Per-league leaderboard: top 3 medal cards + numbered list; value = latest snapshot total_value
    (self uses live balance + holdings); delta = latest snapshot − prev snapshot. Self highlighted green.
    Data fetched via `league_members` with `users(...)` FK join to work around RLS on direct users reads.
  - League controls: pencil-icon rename (creator only); Invite button (member only) inserts
    `league_invites` row with null email + opens native Share sheet with invite URL.
  - Leave League + Create League buttons navigate to `leagues-create` screen (not shown on overall).
  - Comments: post/list/edit-own for both `league_comments` and `overall_comments` tables.
  - Overall leaderboard: top 3 medals + positions 4–10 + ••• separator + 5 surrounding entries if
    user rank > 10. Three sub-modes via green underline links: Overall / Prediction / Shares leaderboard.
    Prediction: sorted by `cumulative_prediction_income` (pts + delta this recalc) — value and delta
    columns show bare numbers, no "pts" suffix.
    Shares: sorted by `investment_pnl` (value + delta = total delta − prediction_income_this_recalc).
  - **Leaderboard column widths**: name `flex-1`, value columns `width: 80` (accommodates 4-digit
    totals like 1.000,00), delta columns `width: 60` (all leaderboard variants — per-league medals,
    per-league list rows, overall medals, overall list rows, shares rows). Prediction pts columns
    stay at `width: 60` / `width: 56`. Data source: `recalculation_user_snapshots` with `users(...)`
    FK join.
  - Uses `useFocusEffect` (not useEffect) so leagues list re-fetches when returning from create screen.
  - Token generation: `Math.random` (crypto not available in RN without polyfill).
  - **User profile popup**: tapping any player name in any leaderboard (medal cards, numbered rows, all
    3 overall sub-modes) opens a modal — but ONLY when market is CLOSED. Shows: name + total portfolio
    value, 2-col stats grid (Predictions €, Shares P&L ±€), upcoming matches since last recalc (stage/
    date/time row, teams with flags, prediction label, share counts per team). `marketOpen` state is
    fetched from `active_trading_window` inside `fetchUserData`. Data fetched by `fetchUserPopup(userId)`
    defined at top of leagues.tsx.
  - **RLS notes** — three policies must exist for the popup (and leaderboard) to show other users' data:
    - `users`: "Authenticated users can read all users" — `USING (true)`, role `authenticated`
      (needed for leaderboard display names)
    - `holdings`: "Authenticated users can view all holdings" — `USING (true)`, role `authenticated`
      (needed for share counts in popup match rows)
    - `match_predictions`: "Authenticated users can view all match predictions" — `USING (true)`
    - `advancement_predictions`: "Authenticated users can view all advancement predictions" — `USING (true)`
    Without these, other users' data silently returns empty (RLS default is own rows only).
- **Create League** (`leagues-create.tsx`): dedicated screen (hidden tab, registered with `href: null`
  in `_layout.tsx`). "← Leagues" back button + section header. White card with league name input.
  Validates on change (regex `/^[a-zA-Z0-9 '\-&.!]+$/`, 2–40 chars) and on blur (Supabase duplicate
  check against `leagues.name`). Green button inserts league row + league_member row, then
  `router.back()`. Uses `Math.random` to generate 6-char alphanumeric `short_id`.
  - **Routing note**: cannot use `leagues/create` directory structure alongside existing `leagues.tsx`
    file in Expo Router v4 — use a flat `leagues-create.tsx` file instead.
  - **Back navigation**: uses `router.navigate('/leagues')` — NOT `router.back()`. Because
    `leagues-create` is a hidden tab (`href: null`), `router.push` from leagues is treated as a tab
    switch (not a stack push), so `router.back()` has no stack entry and falls through to the home tab.
- **Rules** (`rules.tsx`): fetches all values from `game_settings` table. Green gradient summary banner
  (2-col prediction/investment cards), Prediction Game section (group stage + knockout payout table),
  Investment Game section (share pricing bullets, price levels table, trading windows, trading rules).
- **Price popup** (`src/components/PriceModal.tsx`): tapping any country name opens modal with SVG
  price-history chart, % change since last update and since start, toggleable amber floor-price line.
  Default floor mode 'historical'. Uses `react-native-svg`.
  - **Chart windowing**: < 10 data points = show all. Once ≥ 10 points, slide a last-10 window —
    but cap the left edge at the first entry on or after June 11 (first WC match day). After that
    anchor is reached the window grows rather than slides:
    `windowStart = Math.min(prices.length - 10, wcAnchorIdx)` where
    `wcAnchorIdx = prices.findIndex(p => new Date(p.recorded_at) >= new Date('2026-06-11T00:00:00Z'))`.

### Shared components (`src/components/`) and utilities (`src/lib/`)
- `PortfolioBanner.tsx`: gradient banner with total value, cash, shares value, market status/updated.
  Home passes `showSubtitles=true` (shows investment P&L + prediction income); Shares passes `false`.
  Numbers use `text-lg` (`fontSize: 18`), formatted via `useCurrency().format` (nl-NL locale, x.xxx,xx).
  Prediction income subtitle uses `Math.round(n).toLocaleString('nl-NL')` (integer, thousands separator).
- `MarketStatus.tsx`: OPEN/CLOSED pill used by Home and Shares.
- `FlagImage.tsx`: wraps `SvgUri` (from `react-native-svg`) in a `View` with `overflow: 'hidden'` +
  `borderRadius`. Props: `code` (3-letter country code), `size` (default 14), `radius` (default 2).
  Use this for ALL flag rendering — never use `<Image>` with an `.svg` URL on native (breaks silently).
- `src/lib/currency.ts` — `useCurrency()` hook returning `{ format, formatInt }`. `format(n)` renders
  2 decimal places (nl-NL locale); `formatInt(n)` renders 0 decimal places. No currency symbols —
  bare numbers only throughout the app. Use `format` for prices/transactions; use the
  `useIntFormat`/`fmtValue` switching pattern for value columns (see Shares notes above).

### Header (`src/app/(app)/_layout.tsx`)
Username top-right with dropdown menu. Edit icons: name → `users.display_name`, email →
`supabase.auth.updateUser()`. "2026 FIFA WORLD CUP" subtitle has `marginLeft: 4` to align with logo.
Uses `useSafeAreaInsets()` from `react-native-safe-area-context` — `paddingTop: 12 + insets.top` so
the header clears the iPhone notch/Dynamic Island.
- **Username state initialised as `''`** (empty string), not `session?.user?.email`. The display name
  is fetched async; initialising with the email caused the raw email to flash briefly on every
  navigation. Always init to `''` and populate only after the DB fetch completes.
- **Logo**: local file `assets/images/logo.png` (SoccerShareslogotrans.png, 291×58 source),
  displayed via `require('../../../assets/images/logo.png')` at `height: 44, width: 221`.
  Do NOT revert to the remote URL — local loads instantly and works offline.

### Push notifications (`src/lib/push-notifications.ts`)
- `expo-notifications ~0.32.17` installed; plugin in app.json:
  `["expo-notifications", { "iosDisplayInForeground": true, "mode": "production" }]`
  — `mode: "production"` is required for TestFlight/App Store; without it the build gets the
  `aps-environment: development` entitlement and APNs silently drops delivery.
- `registerPushToken(userId)` — called on both `SIGNED_IN` and `INITIAL_SESSION` events in
  `auth-context.tsx`. `INITIAL_SESSION` fires on every app launch when a session is already persisted;
  without it, only fresh logins registered the token — confirmed root cause of Expo Go token staying
  in DB while TestFlight token was never saved. Guards on `Device.isDevice`, requests permission
  (prompts user only if undecided), gets Expo push token via `projectId` from
  `Constants.expoConfig?.extra?.eas?.projectId`, saves to `users.push_token`. Logs each step via
  `console.log`/`console.warn` with `[PushToken]` prefix for EAS build log diagnosis.
  **Expo Go guard**: skips registration entirely when `Constants.appOwnership === 'expo'` — prevents
  Expo Go dev reloads from overwriting the standalone TestFlight token in the database.
- `clearPushToken(userId)` — called in `signOut()` before signing out, sets `push_token` to null.
  Prevents stale token delivering another user's notifications to the wrong device on shared phones.
- Token registration is fire-and-forget — never blocks app usage.
- **Requires a real device + EAS build to test** — push tokens do not work in Expo Go.
- Supabase side: `push_token` column on `users` table, `send-push-notification` Edge Function
  deployed and verified working end-to-end on TestFlight.

### Key gotchas for future work
- `Alert.alert()` onPress callbacks silently fail on Expo web — skip confirmation dialogs entirely.
- `active_trading_window` must be queried with `select('*')` — querying by 'id' returns wrong result.
- Supabase embedded selects use FK column name: `countries(current_price)` not `country:country_id(...)`.
- LinearGradient to-br: use `onLayout` + `end={{ x: (W+H)/(2W), y: (W+H)/(2H) }}` — not `(1,1)`.
- Playing Next groups by US Pacific calendar day (`matchDate − 8 hrs`), not UTC or "next 24 hours".
- **Match date/time styling**: both date and time use the same color (`#374151`, `fontWeight: '500'`).
  Do NOT use `#9ca3af` for the time — it should visually match the date, not be dimmed.
- **No currency symbols**: all monetary amounts are displayed as plain numbers throughout the app
  (no `€` or `$` prefix anywhere). The `fmt()` helpers in each file return bare formatted numbers.
- **TextInput vs Text rendering on iOS**: `TextInput` (`UITextField`) renders text visibly differently
  from `Text` (`UILabel`) even at identical fontSize/fontWeight. In table cells, use tap-to-edit:
  show a `Text` at rest, swap in a focused `TextInput` only while editing, revert on blur.
- **SVG flags on native**: `<Image source={{ uri: '…svg' }}>` silently renders blank on iOS/Android.
  Always use `<FlagImage code={…} />` (wraps `SvgUri` from `react-native-svg`).
- **Safe area**: auth screens need `KeyboardAvoidingView` + `ScrollView` so the sign-in button stays
  visible when the keyboard is open. The app header uses `useSafeAreaInsets` for notch clearance.
- **`reactCompiler: true` is removed from app.json experiments** — it caused `Pressable` style
  callbacks (`({ pressed }) => [...]`) to silently produce no background color in production builds
  (invisible buttons). Do not re-add it. All auth screen buttons use static `style={styles.button}`
  instead of the callback form.
- **Expo Go**: Run `npm start` (pins Metro to port 8081) and scan QR code in Expo Go.
  Use `npx expo start --clear` if the app shows a stale bundle.
  Use `--tunnel` if phone and computer are on different networks.

## EAS Build / TestFlight setup

### iOS 26 crash prevention (permanent fixes — do not remove)
This stack (RN 0.81.5 + reanimated 4.x + react-native-screens) is vulnerable to a confirmed
iOS 26 bug: ObjC/C++ exception interop in `RCTTurboModule.mm` causes crashes from clean SIGABRT
to Hermes GC heap corruption (SIGSEGV). All three fixes below are required:

1. **`patches/react-native+0.81.5.patch`** via `patch-package` — wraps `performMethodInvocation`
   and `performVoidMethodInvocation` in `RCTTurboModule.mm`: captures the NSException, exits
   `@catch` cleanly, then throws outside the block. `@finally` removed entirely. Applied
   automatically via `"postinstall": "patch-package"` in package.json scripts.
   - **CRITICAL**: `patches/` must be git-tracked (`git ls-files patches/` to verify). EAS uses
     `git archive` — untracked files never reach the build server. This silently broke one build.
   - Validate before every build: delete node_modules, `npm install`, check patched file contains
     `capturedSyncException`.

2. **`enableScreens(false)`** — called at module level in `src/app/_layout.tsx` (before any
   component). Bypasses `RNSTabBarController.updateTabBarAppearance` crash on iOS 26
   (react-native-screens#3940).

3. **`expo-status-bar` removed** from package.json — auto-registers via ExpoModulesProvider and
   its iOS 26 status bar APIs caused launch crashes. Do not re-add it.

### EAS project
- **EAS account**: `lcattel` (app.json `owner: "lcattel"`, matches `@lcattel/soccershares-app`)
- **Project ID**: `fe4b4f26-8872-4412-88e2-c5474154a408` (in app.json `extra.eas.projectId`)
- **Bundle identifier**: `nl.soccershares.app`
- **Build number**: managed remotely by EAS (`appVersionSource: "remote"`, `autoIncrement: true`)
- **Production env vars** set in EAS dashboard (not .env — gitignored, never reaches build server):
  - `EXPO_PUBLIC_SUPABASE_URL` (plaintext)
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (sensitive)
- **App icon**: `assets/images/icon.png` — 1024×1024, source is `Vijfhoek.png` (already 1024×1024,
  no padding needed). Source file at:
  `C:\Users\lenna\OneDrive\Documents\SoccerShares WK2026\Images\Logo\Vijfhoek.png`
  (old version archived as `Vijfhoek_old.png` in same folder)

### EAS build conventions
- Always run `npx expo start --clear` and verify in Expo Go before every production build
- Always run `git ls-files patches/` to confirm patch file is git-tracked before building
- Always run `eas env:list --environment production` to confirm env vars are set before building
- Run `eas build` and `eas submit` from your own terminal (not Claude's shell) — needs interactive
  Apple ID auth on first run
- Do not run the same build command in two terminals simultaneously
- `ascAppId`: `6784960022` — already set in eas.json `submit.production.ios`

## Working style preference
The developer (Lennart) prefers Claude Code making direct file edits over being 
given code snippets to manually paste. Always read the actual file before editing 
it, make the change directly, and verify by running the dev server when practical.
