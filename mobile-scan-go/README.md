# Scan & Go Mobile

Expo Router customer app. Route files live in `src/app` and stay thin. Domain code lives in `src/modules/<domain>` with `api.ts`, backend contract `types.ts`, React Query `hooks.ts`, screens, and a public `index.ts`. Shared request/session/config/permission/live/offline code lives in `src/core`; reusable UI and KES/phone helpers live in `src/shared`.

## Start on a phone

1. From the repository root, start the backend with `npm run dev:backend`.
2. In another PowerShell window run `Set-Location -LiteralPath '.\mobile-scan-go'`.
3. Run `npm install` once, then `npx expo start --lan`.
4. Open Expo Go on a phone connected to the same Wi-Fi and scan the Expo QR code.

`EXPO_PUBLIC_API_URL` is read from this folder’s `.env`. The checked-in `.env.example` shows the expected format. Change its LAN address when the computer’s Wi-Fi IP changes, then restart Expo.

## Implemented

- Phone/password login and phone/OTP registration with consent.
- Central API client with secure token storage, concurrent refresh coalescing, one retry after token expiry, and friendly network errors.
- Store selection, server-backed product search, persistent Shop & Collect cart, pickup slots, and full/deposit order creation.
- Poster check-in, location permission explanation, barcode scanner, server basket, M-Pesa payment/status polling, and rotating/cached exit pass.
- Order history, details, substitution responses, support tickets/messages display, account logout controls, connectivity banner, English/Swahili base strings, and authenticated SSE cache invalidation.
- Expo push-token registration plus backend targeted push delivery for payment, substitution, and pickup-ready events.

## Still requires provider setup or backend work

Google sign-in and Google-user phone verification, card checkout UI/return handling, biometric unlock, profile and phone updates, account deletion, and a complete Swahili translation are not implemented. Expo push delivery also needs an EAS project and device build configured before it can be exercised on physical devices. The existing backend does not expose profile-update or account-deletion routes.

The payment backend protects live M-Pesa attempts from duplicate prompts; payment retries and network-loss behavior still need device-level validation. Install dependencies and use an Expo development build for native push testing.
