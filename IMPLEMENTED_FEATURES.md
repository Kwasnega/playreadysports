# Implemented Feature Changes

This document summarizes the changes made in the last implementation pass. It explains each feature, why it was changed, and how it was updated.

## 1. Player Profile Friend / Share UX

### What was implemented
- Updated `src/pages/PlayerProfile.tsx`.
- Added a real `Share profile` CTA that copies the profile URL to the clipboard.
- Replaced placeholder message/invite actions with a clean share action.
- Preserved the pending friend request state UI, including a pulsing `Request Sent` badge.

### Why this was changed
- The previous UI displayed direct messaging and invites, which conflicted with the intended sharing-only profile flow.
- The user requested a better friend CTA experience with visible sent-state feedback.

### Details
- `handleShareProfile()` now generates a share URL using the profile username and copies it using `navigator.clipboard.writeText()`.
- `toast.success()` is shown after copy succeeds, and `toast.error()` is shown if clipboard access fails.
- A new `Share2` icon from `lucide-react` was added to the player profile actions.

## 2. Lobby Chat Sharing-Only Messaging

### What was implemented
- Updated `src/components/LobbyChat.tsx`.
- Improved lobby chat header copy to clarify the chat stays active for match updates, invites, and coordination.
- Reworded the message input placeholder to `Share match updates…`.
- Added low-importance guidance text under the input.

### Why this was changed
- The chat flow should remain the lobby’s active match chat.
- The change was intended to prevent the lobby chat from being mistaken for a private player-to-player messaging channel.

### Details
- Text updates were applied in the header and form UI.
- The chat form layout now includes a small descriptive hint that emphasizes updates, invites, and logistics.

## 3. Admin Matches Grouped Rendering

### What was implemented
- Updated `src/pages/admin/AdminMatches.tsx`.
- Grouped the matches table into three sections: `Upcoming & Full`, `Live`, and `Past`.
- Preserved status filtering while making grouped display easier to scan.

### Why this was changed
- The admin matches panel previously rendered in a single table and did not clearly separate match states.
- This made it harder for admins to locate matches by lifecycle stage.

### Details
- Added `filteredMatches` and `groupedMatches` hooks to compute groups based on `statusFilter` and match status.
- Each group now renders independently with its own header and count.
- The grouped view still shows actions like lobby link, force cancel, and force release for each row.

## 4. Admin Settings Backend / UI Alignment

### What was implemented
- Updated `src/pages/admin/AdminSettings.tsx`.
- Added `commission_rate` support to the settings UI.
- Added validation rules for `commission_rate`.
- Ensured default values are populated correctly when backend settings are missing.
- Updated `backend/supabase/functions/admin-platform-settings/index.ts` to allow `maintenance_mode`.

### Why this was changed
- The admin settings page previously only surfaced some platform settings but not the full allowed set.
- The backend already allowed `commission_rate`, so the UI needed to match that behavior.
- `maintenance_mode` is used elsewhere in admin flows and should be supported through the shared admin settings path.

### Details
- `KEYS` in `AdminSettings.tsx` now includes `commission_rate` along with auto-cancel and incentive keys.
- Defaults are set for commission rate (`0.05`) and other numeric settings.
- Validation now rejects commission rate values above 1.0 and ensures `maintenance_mode` only accepts `true` or `false` in the backend.
- Settings save logic iterates over all keys and persists each via `callAdminSettings("POST", { key, value })`.

## 5. Backend Auto-Cancel / Refund Audit

### What was checked
- Reviewed `backend/supabase/functions/auto-cancel-matches/index.ts`.
- Reviewed `backend/supabase/functions/auto-cancel-stale-matches/index.ts`.
- Reviewed `backend/supabase/functions/complete-match/index.ts`.

### What was confirmed
- `auto-cancel-matches` cancels underfilled paid matches, refunds paid players, and sends notifications.
- `auto-cancel-stale-matches` cancels matches that have already passed but remain `upcoming`, refunds paid players, and notifies users.
- `complete-match` calls `complete_match_atomic`, which already loads organizer incentive and uses platform settings.

### Why this was important
- The user requested assurance that auto-cancel refunds and notifications were operating correctly.
- I verified that the backend logic for participant refunds and notifications is already implemented and consistent with the intent.

## Summary
These changes improve the admin UX, align the admin settings UI with backend behavior, and make the player profile and lobby chat flows match the intended sharing-focused product behavior.

If you want, I can also create a short “Next Steps” section describing the remaining validation and test coverage to complete the deployment.