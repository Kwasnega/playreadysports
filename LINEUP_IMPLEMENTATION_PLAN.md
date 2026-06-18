# Lineup Feature - Implementation Plan

## Phase 1: Database & Backend Setup

### 1.1 Deploy SQL Migration
- Run `20260617010000_add_match_lineups.sql` to create tables:
  - `match_lineups` - stores player positioning
  - `lineup_formations` - preloaded with 10+ formations
- Verify RLS policies are applied correctly
- Test realtime subscriptions for both tables

### 1.2 Create Backend Edge Function (Optional)
- **File**: `backend/supabase/functions/update-lineup/index.ts`
- **Purpose**: Validate and save lineup changes
- **Inputs**: 
  - `match_id`, `team_side`, `player_id`, `assigned_position`, `jersey_number`, `formation`
- **Validation**:
  - Player is on the match
  - Match status is "confirmed"
  - User is either the player or match organizer
  - Position count matches formation requirement
- **Returns**: `{ success: boolean, lineup: MatchLineup[], message?: string }`

### 1.3 Create RPC for Bulk Lineup Initialization
- **Function**: `initialize_match_lineup`
- **Purpose**: When match starts, create empty lineup slots for all confirmed participants
- **Logic**: 
  - Fetch all confirmed participants
  - Split into team_a and team_b
  - Create lineup records with positions from default formation (4-4-2)
  - Assign positions based on preferred_position from user profile

---

## Phase 2: Frontend Hooks & State Management

### 2.1 Create `useMatchLineup` Hook
- **File**: `src/hooks/useMatchLineup.ts`
- **Functions**:
  - `fetchLineup(matchId, teamSide)` - Load all lineups for a team
  - `subscribeToLineup(matchId, teamSide)` - Real-time updates via Supabase
  - `updatePlayerPosition(lineupId, position, x, y)` - Save position change
  - `changeFormation(matchId, teamSide, formationName)` - Bulk reposition all players
  - `fetchFormations()` - Get all available formations
- **Real-time**: Subscribe to `match_lineups` table filtered by match_id + team_side

### 2.2 Create `useMatchTeamPlayers` Hook Enhancement
- Extend existing hook to fetch match participants with current lineup data
- Include player initials, preferred_position, and avatar

### 2.3 State Management
- Use Zustand or React Context to manage:
  - Current formation selection
  - Active lineup
  - Selected player (for modal)
  - Loading/error states

---

## Phase 3: UI Components

### 3.1 Component: `MatchLineup.tsx`
**File**: `src/components/matches/MatchLineup.tsx`

**Structure**:
```tsx
<MatchLineup matchId={matchId} canEdit={isOrganizerOrPlayer} />
```

**Sub-components**:
- `LineupHeader` - Team name, formation selector, formation chips
- `PitchCanvas` - Main green pitch with player jerseys
- `SubstitutesRail` - Horizontal scrollable bench/waitlist
- `PositionModal` - Change player position
- `FormationSelector` - Formation switcher with chip UI

### 3.2 Component: `Pitch.tsx`
**File**: `src/components/matches/Pitch.tsx`

**Features**:
- **Background**: Beautiful green football pitch (SVG or Tailwind)
- **Field markings**: Center line, penalty boxes, goal areas
- **Grid**: 100x100 coordinate system for player placement
- **Player Cards**: Rendered as jerseys at x,y positions
- **Interactivity**: Click jersey → open position change modal

**CSS/SVG**:
```tsx
// Pitch container
<div className="w-full aspect-video bg-gradient-to-b from-green-600 to-green-700 rounded-lg overflow-hidden relative">
  {/* SVG field markings */}
  <svg className="absolute inset-0">
    {/* Lines, boxes, center circle */}
  </svg>
  
  {/* Player jerseys positioned absolutely */}
  {players.map(p => (
    <PlayerJersey key={p.id} player={p} x={p.x_position} y={p.y_position} />
  ))}
</div>
```

### 3.3 Component: `PlayerJersey.tsx`
**File**: `src/components/matches/PlayerJersey.tsx`

**Design**:
- **Dimensions**: 48px × 60px (responsive)
- **Team A**: White background
- **Team B**: Black with white vertical stripes
- **Content**:
  - Large bold initials (e.g., "EH", "JB")
  - Below: Player name (truncated) + position code
  - Jersey number (top corner, optional)
- **States**:
  - Default: Solid color
  - Hover: Slight shadow/scale, cursor pointer
  - Selected: Gold border, glow effect
- **Accessibility**: `aria-label`, `title` attribute

### 3.4 Component: `FormationSelector.tsx`
**File**: `src/components/matches/FormationSelector.tsx`

**Features**:
- Display formation chips (4-3-3, 4-4-2, 4-2-3-1, etc.)
- Show current formation highlighted
- On selection: Trigger `changeFormation()` → auto-reposition all players
- Show player count for each formation
- Premium styling: Dark background, gold accents

### 3.5 Component: `SubstitutesRail.tsx`
**File**: `src/components/matches/SubstitutesRail.tsx`

**Features**:
- Horizontal scrollable container
- Show all non-starting players (bench + waitlist)
- Each player as small jersey thumbnail
- Click to drag into lineup (optional) or open position modal
- Shows jersey count

### 3.6 Component: `PositionModal.tsx`
**File**: `src/components/matches/PositionModal.tsx`

**Features**:
- Modal overlay
- Selected player info (avatar, name, current position)
- List of available positions for selected formation
- Confirmation button
- Smooth animations

---

## Phase 4: Integration with Existing Components

### 4.1 Update `Lobby.tsx`
**File**: `src/pages/Lobby.tsx`

**Changes**:
```tsx
// After TeamsRoster tab, add Lineup tab:
const tabs = [
  { id: "teams", label: "Teams" },
  { id: "chat", label: "Chat" },
  {
    id: "lineup",
    label: "Lineup",
    // Only show if match.status === "confirmed"
    hidden: match.status !== "confirmed"
  }
];

// In tab content:
case "lineup":
  return <MatchLineup matchId={matchId} />;
```

### 4.2 Update Match Status Logic
- Ensure match status transitions to `confirmed` when:
  - All core positions filled
  - Escrow is holding (payment complete)
- Add badge/indicator "Lineup Ready" in Lobby header

---

## Phase 5: Testing & Polish

### 5.1 Feature Testing
- [ ] Test each formation rearrangement
- [ ] Test real-time subscription (multiple clients)
- [ ] Test RLS policies (player can't see opponent team)
- [ ] Test organizer can edit all positions
- [ ] Test mobile responsiveness (pitch scaling)

### 5.2 Performance
- Memoize `PlayerJersey` component (React.memo)
- Lazy load `MatchLineup` component
- Debounce position updates
- Optimize SVG rendering

### 5.3 UX Polish
- Smooth transitions when rearranging players
- Tooltip on hover showing full position name
- Confirmation toast on save
- Error handling if save fails (retry button)

---

## Phase 6: Advanced Features (Future)

### 6.1 Drag & Drop
- Allow dragging jersey to new position
- Visual feedback (ghost jersey, valid drop zones)

### 6.2 Position Templates
- Save custom formations per user
- "My Preferred 4-3-3"

### 6.3 Tactical Playbook
- Draw tactics on pitch (arrows, circles)
- Save as reusable plays

### 6.4 Match Analysis
- Post-match heatmap showing player movement
- Pass completion network

---

## File Structure Summary

```
src/
├── types/
│   └── lineup.ts (types & constants)
├── hooks/
│   ├── useMatchLineup.ts (NEW)
│   └── useMatchTeamPlayers.ts (enhanced)
├── components/
│   └── matches/
│       ├── MatchLineup.tsx (NEW - main container)
│       ├── Pitch.tsx (NEW - pitch rendering)
│       ├── PlayerJersey.tsx (NEW - jersey card)
│       ├── FormationSelector.tsx (NEW)
│       ├── SubstitutesRail.tsx (NEW)
│       ├── PositionModal.tsx (NEW)
│       └── ...existing components...
└── pages/
    └── Lobby.tsx (MODIFIED - add Lineup tab)

backend/
└── supabase/
    ├── migrations/
    │   └── 20260617010000_add_match_lineups.sql (NEW)
    └── functions/
        └── update-lineup/ (OPTIONAL)
```

---

## Success Criteria

✅ Players see their team's lineup on confirmed matches  
✅ Formation can be changed with auto-repositioning  
✅ Real-time updates when others change lineup  
✅ Beautiful FIFA-style pitch UI  
✅ Mobile responsive  
✅ RLS prevents cheating (can't see opponent team)  
✅ Organizer can edit all positions  

---

## Estimated Timeline

- **Phase 1 (DB)**: 30 min - Deploy SQL
- **Phase 2 (Hooks)**: 1 hour - useMatchLineup hook + real-time
- **Phase 3 (UI)**: 3-4 hours - Build 6 components + styling
- **Phase 4 (Integration)**: 30 min - Update Lobby
- **Phase 5 (Testing)**: 1 hour - QA + polish
- **Total**: ~6-7 hours

