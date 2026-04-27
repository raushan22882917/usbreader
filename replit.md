# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## USB Reader & Writer App (`artifacts/usb-reader`)

Expo mobile app — tractor dashboard UI with 4-panel landscape layout.

### Screens
- **Dashboard** (`index.tsx`) — 4-panel: Speedometer + Field Navigation Map + Battery + Power. Custom 9-button bottom tab bar. Satellite map via Leaflet.js/ESRI embedded in iframe (web) with GPS from `navigator.geolocation`. Dashboard is horizontally scrollable.
- **Monitor** (`monitor.tsx`) — Packet log + hex/text/ASCII viewer with MaterialCommunityIcons
- **Write** (`write.tsx`) — Quick-command buttons + TX history + compose terminal
- **Decoder** (`decoder.tsx`) — .bin file upload, HEX/BINARY/DECIMAL/ASCII dump modes
- **Settings** (`settings.tsx`) — Arc gauges, device info, toggle settings

### Key tech
- `react-native-svg` — Speedometer (triangle segments + blue arcs + needle), compass, battery SVG
- Leaflet.js (CDN) + ESRI World Imagery tiles — satellite map loaded as data-URL iframe
- `MaterialCommunityIcons` from `@expo/vector-icons` — all icons
- `expo-haptics` — button feedback
- `expo-document-picker` — BIN file upload
- `navigator.geolocation` — browser GPS (web); falls back to Mumbai default
- No `expo-file-system` (causes watcher crash — do not install)
- Theme: bg `rgba(21,25,27,1)`, green `#6EDCA1`, yellow `#FFC832`, red `#FF503C`, blue `#50B4FF`
