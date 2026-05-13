# PlayReady Sports — Feature Roadmap

## How to use this doc
Each feature has a **Prompt** you can paste directly to build it. Copy → paste → refine.

---

## ADMIN PANEL — 50 Features

### Analytics & Business Intelligence

1. **Real-time Revenue Dashboard**
   - Show live revenue, refunds, fees, and net profit with hourly/daily/weekly breakdown.
   - **Prompt:** *Build a real-time revenue dashboard page at `/admin/revenue` with Recharts line/area charts. Query `transactions` table filtering by `status='completed'` and `type='entry_fee'`. Group by date using a `revenue_per_day` SQL RPC. Show gross revenue, total refunds, platform fees (commission_rate * revenue), and net profit. Add date range picker (7d, 30d, 90d, custom). Display trend arrows (↑/↓ %) compared to previous period. Use dark theme cards matching AdminOverview style.*

2. **Player Retention Cohort Analysis**
   - Track how many players who joined in Week 1 returned in Week 2, 3, 4.
   - **Prompt:** *Create an SQL function `player_cohorts(start_date, weeks)` that returns cohort retention data. Build `/admin/cohorts` page with a heatmap table (rows = signup week, columns = week number, cells = % retained). Colour cells from red (0%) to green (100%). Include total players per cohort in first column. Use Supabase RPC for the query.*

3. **Top Earning Venues Report**
   - Rank venues by total entry fees collected.
   - **Prompt:** *Build `/admin/venue-analytics` with a ranked table of venues. SQL: `SELECT v.name, COUNT(m.id) as match_count, SUM(t.amount) as revenue FROM venues v LEFT JOIN matches m ON m.venue_id=v.id LEFT JOIN transactions t ON t.match_id=m.id WHERE t.status='completed' AND t.type='entry_fee' GROUP BY v.id ORDER BY revenue DESC`. Show bar chart of top 10. Add filters for city, date range.*

4. **Payment Success Rate Monitor**
   - Track % of Paystack payments that succeed vs fail.
   - **Prompt:** *Build `/admin/payment-health` page showing Paystack payment metrics. Query transactions table: count by status ('completed', 'failed', 'pending'). Show pie chart (Recharts) of statuses. Show daily trend line of success rate %. Add alert banner if success rate drops below 90% in last 24h.*

5. **Organizer Performance Leaderboard**
   - Rank match creators by matches hosted, players attracted, revenue generated.
   - **Prompt:** *Build `/admin/organizers` leaderboard. SQL: group matches by organizer_id, count matches, sum entry_fee * core_paid_count as revenue, count distinct participants. Rank by revenue. Show top 20 in table with avatar, name, matches, revenue, avg rating. Allow CSV export.*

6. **City Performance Heatmap**
   - See which cities generate the most matches and revenue.
   - **Prompt:** *Build `/admin/cities` page. SQL: JOIN matches→venues, group by city. Show metrics: match count, total revenue, avg entry fee, unique players. Display as sortable table and horizontal bar chart. Add map integration (Leaflet) with city markers sized by revenue.*

7. **Session Duration Analytics**
   - How long do players stay in the app? What screens keep them longest?
   - **Prompt:** *Create `user_sessions` table (session_id, user_id, start_time, end_time, pages_visited text[]). Build `/admin/sessions` showing avg session duration, bounce rate, top screens by time. Show line chart of daily avg session time. Prompt: integrate React posthog-js or simple visibility API to track page views and time.*

8. **Abandoned Payment Recovery**
   - List players who started but didn't complete payment.
   - **Prompt:** *Build `/admin/abandoned` page. Query `transactions` where status='pending' and created_at > 24h ago. Show player contact (email from profiles), match join_code, amount, time since abandoned. Add "Send reminder" button that triggers a notification via Supabase edge function. Show conversion rate after reminders.*

9. **Lifetime Value (LTV) Per Player**
   - How much revenue does each player generate over time?
   - **Prompt:** *Build `/admin/ltv` page. SQL: for each player, sum all entry_fee transactions as revenue, count matches joined, first_join_date, last_join_date. Show table sorted by LTV desc. Add histogram showing player distribution across LTV buckets (0, 1-50, 51-100, 100+ GHS).*

10. **Commission Earnings Breakdown**
    - Monthly fee earnings with payout tracking.
    - **Prompt:** *Build `/admin/commissions` page. For each completed match, calculate commission (entry_fee * commission_rate * paid_count). Group by month. Show line chart of monthly commission, total to date, projected next month based on current trajectory. Add "Mark as withdrawn" button for accounting.*

### User Management

11. **Player Verification Queue**
    - Approve/reject KYC submissions (ID photos).
    - **Prompt:** *Add `kyc_submissions` table: user_id, id_photo_url, status ('pending','approved','rejected'), submitted_at, reviewed_at, reviewed_by. Build `/admin/kyc` page showing pending submissions with ID photo preview, player info. Approve/Reject buttons. On approve, set profiles.is_verified=true. On reject, allow reason textarea.*

12. **Bulk User Messaging**
    - Send push/email to all players or filtered groups.
    - **Prompt:** *Build `/admin/mass-message` page. Textarea for message. Filters: all users, by city, by last active date, by match count. Preview recipient count. On send, insert rows into `notifications` table for each user. Show delivery status (read/unread) via notification analytics. Add template system (saved messages).*

13. **User Ban Appeals**
    - Let banned users submit appeals, admin reviews.
    - **Prompt:** *Add `ban_appeals` table: user_id, reason_text, status, created_at. Build `/admin/appeals` page showing pending appeals. Allow admin to read appeal, view user history (reports, matches), then Uphold Ban or Unban. On unban, set profiles.is_banned=false and send notification to user.*

14. **Referral Program Tracking**
    - Track invite codes and rewards.
    - **Prompt:** *Add `referrals` table: referrer_id, referred_id, status, reward_amount. Build `/admin/referrals` page. Show total referrals, conversion rate, top referrers table. Show pending rewards vs paid rewards. Add "Process payout" button to mark referrals as paid.*

15. **User Role Management**
    - Assign/revoke admin, moderator, turf_owner roles.
    - **Prompt:** *Build `/admin/roles` page. Search users by name/email. Dropdown to assign role (player, turf_owner, admin, super_admin). Show current role badges. Log role changes in audit_log. Prevent self-demotion (can't remove own admin status). Show role count stats (total admins, mods, etc.).*

16. **Player Search & Deep Profile**
    - Search any player and see full history.
    - **Prompt:** *Build `/admin/players` search page with global search (name, email, username). On click, show deep profile modal: basic info, match history, payment history, reports filed/received, reviews given, ban status, audit trail. All data fetched via parallel Supabase queries.*

17. **Duplicate Account Detection**
    - Flag accounts with same device/email pattern.
    - **Prompt:** *Build `/admin/suspected-dupes` page. SQL: find profiles with same phone number, similar email (before @), or same IP from audit_log. Show side-by-side comparison of suspected duplicates. Allow admin to mark as "Confirmed duplicate" and merge or ban secondary account.*

18. **User Export (GDPR Compliance)**
    - Download all data for a user.
    - **Prompt:** *Add "Export user data" button in admin player detail. Generate JSON containing: profile, matches joined/participated, transactions, messages, notifications, reports, reviews. Trigger download as `.json` file. Also add "Delete all user data" button for GDPR right-to-erasure.*

19. **Reputation Score Override**
    - Manually adjust player ratings if manipulated.
    - **Prompt:** *In admin player detail, show current reputation_score with "Override" button. Allow entering new score (0-100) with reason text. Log in audit_log. Show reputation history graph (score changes over time). Show which reviews contributed to current score.*

20. **VIP / Power User Badge**
    - Mark high-engagement players as VIP.
    - **Prompt:** *Add `profiles.is_vip` boolean. Build auto-criteria: joined 10+ matches, LTV > ₵200, 0 reports. Show VIP list at `/admin/vip`. Allow manual add/remove. VIP badge appears on their profile publicly. Send VIP-exclusive notifications.*

### Match Operations

21. **Match Scheduler Calendar**
    - Full calendar view of all matches.
    - **Prompt:** *Build `/admin/calendar` using react-big-calendar or custom grid. Fetch all matches, display as coloured blocks (upcoming=green, live=amber, cancelled=red). Click to show match details popup. Drag to reschedule (update match_date). Filter by venue, city, status.*

22. **Force Cancel Match**
    - Admin can cancel any match with reason.
    - **Prompt:** *Add "Force cancel" button in Live Monitor for each match. Opens modal requiring cancellation reason (select from dropdown: venue unavailable, weather, safety concern, other). Calls cancel-match edge function. Logs reason in matches.notes and audit_log. Sends push notification to all participants with reason.*

23. **Match Escrow Override**
    - Release or hold funds manually.
    - **Prompt:** *In `/admin/live` or `/admin/matches`, add escrow status column. For matches with escrow_status='holding', show "Release to organizer" or "Refund all" buttons. Release calls edge function to initiate organizer payout via Paystack transfer. Refund initiates Paystack bulk refund.*

24. **Venue Availability Calendar**
    - See which time slots are booked per venue.
    - **Prompt:** *Build `/admin/venue-schedule` with weekly calendar per venue. Fetch all matches for selected venue. Show coloured blocks for each match. Grey out unavailable slots. Allow admin to block time slots (insert fake match with status='blocked').* 

25. **Weather-Based Match Cancellation**
    - Auto-suggest cancellation if rain forecast.
    - **Prompt:** *Integrate OpenWeatherMap API (free tier). In `/admin/live`, show weather badge on each match (sunny, rain, cloudy). If rain forecast within 3h of kickoff, show amber alert "Rain expected — consider cancellation". One-click cancel button appears. Store weather data in matches table.*

26. **Match Quality Score**
    - Rate how well a match went based on attendance, reviews, no-shows.
    - **Prompt:** *After match completion, auto-calculate Match Quality Score (0-100): (attendance_rate * 40) + (avg_review_rating * 30) + (payment_completion * 20) + (on_time_bonus * 10). Show in `/admin/matches` table. Colour code: green 80+, amber 50-79, red <50.*

27. **Auto-Matchmaking Suggestion**
    - Suggest merging two under-filled matches at same venue/time.
    - **Prompt:** *Build `/admin/merge-suggestions` page. SQL: find pairs of upcoming matches at same venue within 2h of each other, where combined paid_count < max_core_players * 1.5. Show side-by-side comparison. "Suggest merge" sends notification to both organizers with proposed combined match details.*

28. **Match Template Library**
    - Save frequently used match setups.
    - **Prompt:** *Add `match_templates` table: name, match_mode, format, duration, entry_fee, venue_id, max_core_players. In Create Match flow, show "Use template" dropdown pre-filling all fields. In admin, `/admin/templates` CRUD page for managing templates.*

29. **Post-Match Incident Log**
    - Record any issues (injuries, fights, venue damage).
    - **Prompt:** *Add `incidents` table: match_id, reported_by, description, severity ('low','medium','high'), status, created_at. Build `/admin/incidents` page showing all logged incidents. Link to match detail. High severity incidents trigger notification to all admins.*

30. **Match Replay Upload**
    - Let organizers upload match footage.
    - **Prompt:** *Add `match_replays` table: match_id, video_url, thumbnail_url, uploaded_by, created_at. In lobby (post-match), show "Upload replay" button for organizer. Store videos in Supabase Storage `replays` bucket. In admin `/admin/replays`, list all with playback. 30-day auto-delete to save storage.*

### Financial Control

31. **Organizer Payout Dashboard**
    - Track how much each organizer is owed.
    - **Prompt:** *Build `/admin/payouts` page. For each completed match, calculate organizer_earnings = (entry_fee * paid_count) - platform_commission. Group by organizer. Show pending payouts, paid payouts, total owed. "Process payout" button triggers Paystack transfer API. Store payout record in new `payouts` table.*

32. **Transaction Reconciliation**
    - Compare Supabase transactions with Paystack records.
    - **Prompt:** *Build `/admin/reconciliation` page. Fetch last 100 Paystack transactions via API. Compare with `transactions` table by reference. Highlight mismatches (Paystack says success but DB says pending, or vice versa). Allow admin to "Sync status" to fix individual records.*

33. **Promo Code System**
    - Create discount codes for entry fees.
    - **Prompt:** *Add `promo_codes` table: code (text unique), discount_amount (fixed or %), max_uses, uses_count, expires_at, is_active. In paystack-init edge function, check for promo code and adjust amount. In admin `/admin/promos`, CRUD with usage stats table showing who used it.*

34. **Dynamic Pricing Suggestion**
    - Suggest entry fees based on venue popularity and demand.
    - **Prompt:** *Build `/admin/pricing` page. For each venue, show: avg_entry_fee, match_fill_rate %, demand_score (based on how fast matches fill). Suggest optimal price range (current avg ±20%). Show price elasticity chart: X-axis price, Y-axis fill rate. Use historical match data.*

35. **Revenue Forecasting**
    - Predict next month's revenue based on scheduled matches.
    - **Prompt:** *Build `/admin/forecast` page. SQL: sum(entry_fee * max_core_players) for all upcoming matches in next 30 days = projected_gross. Apply commission rate = projected_fees. Show as stacked bar chart: confirmed revenue (already paid) vs projected revenue (not yet paid). Confidence indicator based on historical conversion rate.*

36. **Refund Audit Trail**
    - Track every refund reason and amount.
    - **Prompt:** *Enhance `/admin/refunds` page. Show all refund transactions with: original payment ref, refund amount, reason (match_cancel, player_left, dispute), processed_by (system/admin), date. Allow filtering by reason, date range. Export as CSV. Show refund rate % trend.*

37. **Payment Gateway Switching**
    - Toggle between Paystack test/live or add multiple gateways.
    - **Prompt:** *Add `payment_gateways` table: name, is_active, is_test, public_key, secret_key (encrypted). Build `/admin/gateways` page. Toggle active gateway. Show transaction volume per gateway pie chart. Support adding new gateway configs (Flutterwave, Stripe).* 

38. **Subscription Plan for Turf Owners**
    - Monthly fee for venues to get featured placement.
    - **Prompt:** *Add `subscriptions` table: user_id, plan ('basic','featured','premium'), amount, status, started_at, expires_at. Build `/admin/subscriptions` page. Featured venues appear at top of venue list. Premium venues get badge and highlighted card. Integrate Paystack subscription/recurring payment.*

39. **Platform Wallet / Credit System**
    - Users buy credits instead of per-match payments.
    - **Prompt:** *Add `wallet_balances` table: user_id, balance (numeric). Add `wallet_transactions` table: user_id, amount, type ('deposit','spend','refund','bonus'). In paystack-init, allow topping up wallet. In join-paid-match, allow paying from wallet. Admin `/admin/wallets` shows total system float, top users by balance.*

40. **Chargeback Management**
    - Handle disputed payments.
    - **Prompt:** *Add `chargebacks` table: transaction_id, amount, reason, status ('open','won','lost'), evidence_url. Build `/admin/chargebacks` page. Link to original transaction. Upload evidence (screenshots, chat logs). Track win/loss rate. High chargeback rate triggers organizer review.*

### Venue Management

41. **Venue Onboarding Workflow**
    - Turf owners submit venues for admin approval.
    - **Prompt:** *Add `venue_submissions` table with all venue fields + status ('pending','approved','rejected'). Build `/admin/venue-submissions` page showing pending submissions with photos, owner details. Approve button creates venue + notifies owner. Reject button sends reason.*

42. **Venue Inspection Report**
    - Admin logs physical inspections.
    - **Prompt:** *Add `venue_inspections` table: venue_id, inspector_id, rating (1-5), notes, photo_urls, inspected_at. Build `/admin/inspections` page. Show inspection history per venue. Poor ratings (>3.0 avg) flag venue for review. Require re-inspection every 6 months.*

43. **Dynamic Venue Pricing**
    - Venue owners set hourly rates that affect suggested match fees.
    - **Prompt:** *Add `venue_pricing` table: venue_id, day_of_week, hour_start, hour_end, price_per_hour. Build `/admin/venue-pricing` page showing calendar grid per venue. In Create Match, use venue pricing to suggest entry_fee (venue_cost / max_players + commission).*

44. **Venue Amenities Checklist**
    - Track what's available at each pitch.
    - **Prompt:** *Add `venue_amenities` table or use JSONB: venue_id, amenities JSONB {lights: true, changing_rooms: true, parking: false, water: true, first_aid: false}. Build `/admin/amenities` page. Checkbox grid per venue. Show amenity icons on client venue cards (lightbulb, car, etc.). Filter search by amenities.*

45. **Venue Owner Revenue Portal**
    - Sub-admin view for turf owners.
    - **Prompt:** *Create restricted admin view at `/owner/dashboard` for users with role='turf_owner'. Show only their venues. Metrics: matches hosted, total revenue earned, avg occupancy %. Allow them to update venue photos, hours, pricing. Cannot see other venues or global admin data.*

### Marketing & Growth

46. **Push Notification Composer**
    - Rich text editor + scheduling for broadcast messages.
    - **Prompt:** *Build `/admin/notifications` page with title/body inputs. Target: all users, city, match participants, or individual user. Schedule for later (date-time picker). Preview on mobile frame. Show sent history with open rates. Integrate with OneSignal or Firebase Cloud Messaging.*

47. **Referral Campaign Builder**
    - Create time-limited referral bonuses.
    - **Prompt:** *Build `/admin/campaigns` page. Create campaign: name, reward_amount, start_date, end_date, max_referrals_per_user. Auto-generates referral codes. Show campaign performance: total codes, activations, cost. Pause/resume campaigns.*

48. **Social Media Content Generator**
    - Auto-generate shareable match summary images.
    - **Prompt:** *After match completion, use html2canvas to generate a shareable match result card (score, scorers, venue photo). Store in `match_social_cards` table. Admin `/admin/social` shows all generated cards. One-click download. Show engagement metrics if integrated with social APIs.*

49. **SEO / Sitemap Management**
    - Generate public sitemap for match discovery.
    - **Prompt:** *Build edge function `/sitemap.xml` that generates XML sitemap of all upcoming public matches. Include match URLs, lastmod, priority. Build `/admin/seo` page showing indexed match count, top search keywords, broken links. Submit sitemap to Google Search Console API.*

50. **A/B Test Manager**
    - Test different UI copy, pricing, or flows.
    - **Prompt:** *Add `ab_tests` table: name, variant_a, variant_b, target_audience, start_date, end_date. Build `/admin/ab-tests` page. Define tests for: entry fee display (₵20 vs "₵20/person"), CTA colour, match card layout. Track conversion rate per variant. Declare winner with statistical significance indicator.*

---

## APP-WIDE — 50 Features

### Match Experience

1. **Live Score Tracker**
   - Real-time score updates during the match.
   - **Prompt:** *Add `match_events` table: match_id, minute, event_type ('goal','card','sub','injury'), team, player, notes. In lobby (live status), show scoreboard with minute timer. Organizer can tap +Goal for each team. Show running timeline. After match, generate match report card.*

2. **Player Lineup Builder**
   - Organiser sets teams before kickoff.
   - **Prompt:** *In lobby (pre-match), organizer drags participants into Team A / Team B positions. Store in `match_lineups` table: match_id, user_id, team, position, jersey_number. Show visual pitch diagram (SVG) with player positions. Save formations (4-4-2, 4-3-3, etc.).*

3. **Half-Time Switcher**
   - Auto-suggest switching sides at halftime.
   - **Prompt:** *When match duration reaches 50%, show "Half-time" banner in lobby with Switch Sides button. If tapped, swap team colours/positions in lineup display. Optional: prompt organizer to enter half-time score.*

4. **Man of the Match Voting**
   - Players vote for best performer post-match.
   - **Prompt:** *After organizer marks match complete, show voting UI to all participants. 5-star rating + optional comment. Store in `motm_votes` table. Show winner in match summary. MotM badge on player profile for 7 days.*

5. **Substitutions Tracking**
   - Log who came on and off during the match.
   - **Prompt:** *In live lobby, organizer taps participant → "Sub On/Off". Records minute, player in, player out. Shows in match timeline. Useful for 11v11 tracking. Store in `match_substitutions` table.*

6. **Match Video Highlights**
   - Upload short clips after the game.
   - **Prompt:** *Post-match, organizer can upload 3x 15-sec video clips from phone. Store in Supabase Storage `highlights` bucket. Display as horizontal scroll in lobby. Auto-generate thumbnail. Show view count. Allow players to comment with emojis.*

7. **Team Chat Channels**
   - Separate chat per team + general match chat.
   - **Prompt:** *Upgrade LobbyChat to support multiple channels: "General", "Team A", "Team B". Store channel in messages table (add `channel` column). Team channels only visible to respective team members. General visible to all. Show unread badges per channel.*

8. **Weather Widget**
   - Show forecast for match day and venue.
   - **Prompt:** *In lobby and create-match flow, integrate OpenWeatherMap API. Show weather icon, temp, rain % for match kickoff time. If rain > 60%, show amber warning banner: "Rain expected — bring boots!" Cache weather data for 1h.*

9. **Directions to Venue**
   - One-tap Google/Apple Maps navigation.
   - **Prompt:** *In lobby, add "Get directions" button next to venue name. Opens `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`. If lat/lng unavailable, use venue address string. Show estimated travel time if user's location is known.*

10. **Parking / Transport Info**
    - Venue-specific parking and public transport tips.
    - **Prompt:** *Add `venues.parking_info` and `venues.transport_info` text fields. In admin venue form, add these fields. In lobby, show as expandable accordion: "Getting here" with parking tips, nearby bus stops, ride-hailing drop-off point. Use MapPin icon.*

### Social & Community

11. **Player Profile Cards**
    - Shareable player stat cards for social media.
    - **Prompt:** *On player profile, add "Share my stats" button. Use html2canvas to generate a card: player name, matches played, goals (if tracked), avg rating, favourite position. Download as PNG. Card uses brand colours and PlayReady logo.*

12. **Friend System**
    - Add friends, see their match activity.
    - **Prompt:** *Add `friendships` table: requester_id, recipient_id, status ('pending','accepted'). In player profile, "Add friend" button. Friends tab in home showing upcoming matches friends are playing. Activity feed: "John joined a match at Labone Astro". Mutual friends count.*

13. **Match Reminders**
    - WhatsApp/SMS reminders 24h and 1h before kickoff.
    - **Prompt:** *Add `reminder_settings` to profiles (whatsapp_number, sms_enabled). Use Twilio or Termii for SMS. Edge function cron job runs every hour: query matches in next 24h and 1h. Send reminder to all paid participants with match details and directions link. Log delivery.*

14. **Achievement System**
    - Unlock badges for milestones.
    - **Prompt:** *Add `achievements` table: id, name, description, icon_url, criteria. Add `user_achievements` junction table. Implement: "First Match", "10 Matches", "Hat-trick Hero", "Punctual Player" (0 no-shows), "Social Butterfly" (5 friends). Show badge grid on profile. Toast notification on unlock.*

15. **Player Stories / Status Updates**
    - Like Instagram stories but for match moments.
    - **Prompt:** *Add `stories` table: user_id, media_url, caption, created_at, expires_at (24h). Show StoriesRail at top of home feed. Tap to view full-screen story with tap-through. Auto-delete after 24h via edge function cron. Only visible to friends if profile is private.*

16. **Match Recap Generator**
    - Auto-generated match summary with stats.
    - **Prompt:** *After match complete, auto-generate recap: "PlayReady Match Recap — Reds 4-2 Blues at Labone Astro. Scorers: Kwame (2), Kofi, Abena. MotM: Kwame. 14 players attended." Shareable as text + generated image card. Store in match.notes field.*

17. **Community Forum / Feed**
    - Public discussion board for football topics.
    - **Prompt:** *Add `posts` and `comments` tables. Build `/community` feed. Posts can be text, image, or poll. Show trending topics. Like and reply system. Moderation: report post button. Admin can pin posts, delete inappropriate content.*

18. **Team Pages**
    - Fixed teams with roster, stats, and team chat.
    - **Prompt:** *Add `teams` table: name, logo_url, captain_id, city. Add `team_members` junction table. Team page shows roster, win/loss record, avg goals. Team-only chat. Organiser can create match "as Team X" auto-filling their roster. Team badge on match cards.*

19. **Player Rankings / Leaderboard**
    - City-wide or sport-specific player leaderboards.
    - **Prompt:** *Build `/leaderboards` page. Categories: Most Matches, Highest Rated, Top Scorer, Clean Sheets (GK). Filter by city, month, all-time. Show top 50 in table. Top 3 get special podium visual (gold/silver/bronze). Weekly reset for "Player of the Week".*

20. **Group Chats Outside Matches**
    - Create football discussion groups.
    - **Prompt:** *Add `groups` table: name, description, created_by, is_public. Add `group_members` and `group_messages` tables. Browse public groups, request to join private ones. Real-time messaging. Group admin can kick members, set group photo.*

### Payment & Commerce

21. **Pay with Mobile Money**
    - MTN/Vodafone/AirtelTigo integration via Paystack.
    - **Prompt:** *Ensure Paystack inline-js popup shows mobile money channels. In paystack-init metadata, pass `channels: ['card', 'mobile_money']`. Test with Paystack test mode. Show provider icon (MTN, Vodafone) in transaction history. Handle USSD flow for feature phones.*

22. **Pay with Wallet Balance**
    - Use stored credits to join matches.
    - **Prompt:** *In join-paid-match flow, show wallet balance. If sufficient, show "Pay with Wallet" button. Deduct from wallet_balances, create transaction record type='wallet_spend'. If insufficient, show "Top up ₵X" redirecting to Paystack. Wallet history in profile.*

23. **Split Payment / Team Captain Pays**
    - One person pays for the whole team.
    - **Prompt:** *In match creation, add option "Captain covers team fee". Captain pays full venue cost upfront. Other players join free. In lobby, show "Covered by [Captain Name]". Captain gets "Team Manager" badge. Useful for corporate/school teams.*

24. **Pay-What-You-Can Sliding Scale**
    - Organizer sets min/max, player chooses within range.
    - **Prompt:** *In create match, organizer sets min_fee and max_fee instead of fixed. Player sees slider: "Contribute ₵15-₵25" with suggested amount. Amount goes to same pool. Shows average contribution so far. Encourages inclusive play.*

25. **Subscription Membership**
    - Monthly unlimited play pass.
    - **Prompt:** *Add `memberships` table: user_id, tier ('basic','pro'), price, expires_at, matches_remaining. Basic = 4 matches/month, Pro = unlimited. In join flow, check if active membership covers the match. Show membership badge on profile. Auto-renew via Paystack subscription.*

26. **Gift Match Credits**
    - Buy credits for a friend.
    - **Prompt:** *In profile/wallet, "Gift credits" button. Enter friend's username/email, amount ₵. Pay via Paystack. Recipient gets notification + wallet credit. Show gift history. Add gift message option.*

27. **Cashback Rewards**
    - Earn % back after each match.
    - **Prompt:** *After match completion, credit wallet with cashback (e.g. 2% of entry fee). Show "You earned ₵0.40 cashback" toast. Cashback balance visible in wallet. Can be used for next match. Admin sets cashback % in platform_settings.*

28. **Invoice Generator**
    - PDF receipts for company/team expenses.
    - **Prompt:** *In transaction history, add "Download invoice" button. Generate PDF using jsPDF or react-pdf. Include: PlayReady logo, company info, payer details, match info, amount, VAT (if applicable), date, reference number. Professional layout for expense claims.*

29. **Tipping the Organizer**
    - Optional extra payment to thank the host.
    - **Prompt:** *Post-match, show "Tip organizer" button. Preset amounts: ₵2, ₵5, ₵10, custom. Goes to organizer wallet. 100% to organizer (no commission). Shows tip total on organizer profile as "Appreciated by X players".*

30. **Equipment Rental**
    - Rent bibs, cones, balls at venue.
    - **Prompt:** *Add `equipment` table: venue_id, item_name, price, available_count. In create match, organizer can add equipment rental. In join flow, players see equipment options with prices. Equipment fees added to total. Venue owner gets equipment revenue notification.*

### Discovery & Onboarding

31. **Smart Match Recommendations**
    - AI-suggested matches based on play history.
    - **Prompt:** *Build recommendation engine: query user's past matches (venue, time, format). Suggest upcoming matches with similar attributes, within 5km, at preferred times. Show "For You" section on home feed. Use simple weighted scoring, no ML needed initially.*

32. **Onboarding Tutorial**
    - First-time user walkthrough.
    - **Prompt:** *Use react-joyride or custom overlay tutorial. Steps: 1) Welcome screen, 2) Point to "Create Match" button, 3) Explain match codes, 4) Show "Join" flow, 5) Payment explanation, 6) Profile setup. Store `has_completed_onboarding` in localStorage + profiles table.*

33. **Position Selector**
    - Pick your playing position during sign-up.
    - **Prompt:** *Add position selector in profile edit and onboarding. Visual pitch diagram (SVG) where user taps their preferred position. Positions: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST, CF. Store in profiles.preferred_position. Show position icon on match cards.*

34. **Skill Level Matching**
    - Tag matches as Casual, Intermediate, or Pro.
    - **Prompt:** *Add `skill_level` enum to matches (casual, intermediate, advanced, pro). In create match, organizer selects level. In join/browse, show skill badge. Filter by skill level. In profile, set player's self-rated skill. Prevent beginners from joining pro matches (soft warning).* 

35. **Age Group Filtering**
    - Under-18, Open, 35+ categories.
    - **Prompt:** *Add `age_group` to matches and profiles: ('u18','open','35+','45+'). In create match, set age_group. In join flow, check profile.birthdate vs match age_group. Show age-appropriate matches first. Parental consent flag for U18.*

36. **Gender-Specific Matches**
    - Women's only, men's only, mixed options.
    - **Prompt:** *Add `gender_filter` to matches: ('men','women','mixed'). Profile captures gender. Filter join flow accordingly. Women's matches get pink accent colour. Show "Women's Night" badge. Mixed is default.*

37. **Private Match Discovery**
    - Follow friends to see their private matches.
    - **Prompt:** *Change private match visibility: visible to friends only. In home feed, show "Friends playing" section with their private matches. "Request to join" button sends notification to organizer. Organizer approves/rejects. Friends-only matches have lock icon.*

38. **Match Replay / Highlights Reel**
    - Browse past match videos community-wide.
    - **Prompt:** *Build `/highlights` page. Grid of match replay thumbnails from all public/completed matches. Filter by city, venue, month. Tap to watch. Like and comment system. Trending highlights algorithm: views + likes + recency.*

39. **Turf Owner App Lite**
    - Simplified interface for venue managers.
    - **Prompt:** *Create `/owner` route with restricted view. Shows only their venue(s). Simple metrics: today's matches, this week's revenue, occupancy %. Can update venue photos, hours, pricing. Cannot create matches or see player data. Mobile-optimised.*

40. **Offline Mode / Cached Matches**
    - View joined matches without internet.
    - **Prompt:** *Use Service Worker + IndexedDB (via Dexie.js) to cache: user's matches, venue details, participant lists. If offline, show cached data with "offline" badge. Allow viewing match details, lobby chat history. Queue actions (leave match) for when back online.*

### Safety & Trust

41. **Emergency SOS Button**
    - Panic button during match sends location to trusted contacts.
    - **Prompt:** *In lobby (live match), floating SOS button. Tap → confirms → sends WhatsApp/SMS to emergency contacts with venue name, Google Maps link, timestamp. Also logs in `safety_events` table. Admin gets notification. 3-second delay to cancel.*

42. **Injury Reporting**
    - Log injuries with first-aid notes.
    - **Prompt:** *Post-match or during match, any player can report injury. Form: body part, severity (1-5), description, photo optional. Notify organizer and venue owner. Store in `injury_reports` table. Admin sees injury trends by venue. Suggest venues with first_aid=true.*

43. **Digital Waiver Signing**
    - Pre-match liability acceptance.
    - **Prompt:** *Before first join, show liability waiver: "I acknowledge risks of sports injury...". User types full name to sign. Store signature record in `waivers` table: user_id, signed_at, ip_address. Cannot join match without valid waiver. Annual re-sign required.*

44. **Venue Safety Rating**
    - Rate venue safety post-match.
    - **Prompt:** *After match, rating includes venue safety (1-5): pitch condition, lighting, facilities, emergency access. Store in `venue_safety_ratings` table. Show avg safety score on venue cards. Venues below 3.0 get warning to owner.*

45. **Identity Verification Badge**
    - Green checkmark for ID-verified players.
    - **Prompt:** *Players upload ID photo in profile settings. Admin approves in KYC queue (admin feature #11). Once approved, green Verified badge appears on profile and match cards. Verified players get priority in join queues. Unverified users see "Verify to build trust" CTA.*

46. **Block / Mute Player**
    - Hide matches from specific players.
    - **Prompt:** *In player profile, "Block" button. Blocked player cannot see your matches, join your matches, or message you. Store in `blocks` table: blocker_id, blocked_id. Check in match visibility queries. Show blocked list in profile settings with unblock option.*

47. **Match Insurance Option**
    - Optional injury insurance for ₵2-5.
    - **Prompt:** *In join-paid-match flow, toggle "Add injury insurance ₵3". Paystack total increases. Insurance fund tracked in platform_settings. If injury reported within 24h, admin can approve ₵50-200 payout from insurance fund. Show insurance stats in admin.*

48. **Safe Transport Partners**
    - Recommended ride-hailing discounts post-match.
    - **Prompt:** *Post-match, show "Get home safe" card with Uber/Bolt discount code. Partner API integration or static codes. Show estimated fare to user's saved home location. Revenue share with transport partner if referral code used.*

49. **Parental Controls (U18)**
    - Parent email notifications and approval.
    - **Prompt:** *For U18 profiles, require parent_email. Send parent email on every match join with details and cancel link. Parent can set: max matches per week, max spend per month, allowed venues, allowed times. Parent dashboard at `/parent` with activity feed.*

50. **Community Guidelines Quiz**
    - Must pass before first match join.
    - **Prompt:** *On first join attempt, show 5-question quiz about sportsmanship, no-show policy, refund rules, safety, reporting. Must get 4/5 correct. Store `passed_quiz` in profiles. Re-take allowed. Reduces disputes and no-shows.*

### Engagement & Retention

51. **Streak Tracker**
    - Consecutive weeks played badge.
    - **Prompt:** *Calculate streak: count consecutive weeks with at least 1 completed match. Show flame icon with number on profile. "3-week streak!" toast after match. Lose streak if no match in 7 days. Leaderboard for longest streaks.*

52. **Weekly Challenges**
    - "Play 2 matches this week" for bonus credits.
    - **Prompt:** *Add `weekly_challenges` table: description, target_count, reward_amount, start_date, end_date. Show active challenge banner on home. Track progress bar. On completion, auto-credit wallet + show celebration toast. New challenge every Monday.*

53. **Season / League System**
    - Multi-week league with standings table.
    - **Prompt:** *Add `leagues` table: name, start_date, end_date, format. Teams play weekly fixtures. `league_standings` table tracks: played, wins, draws, losses, goals_for, goals_against, points. Auto-generate fixtures. Show standings table. Top teams advance to playoffs.*

54. **Fantasy Football Integration**
    - Pick players, earn points from real match stats.
    - **Prompt:** *Add `fantasy_teams` and `fantasy_picks` tables. Each week, users pick 5 players from upcoming matches. Points: goal=5, assist=3, clean sheet=4, yellow=-1, red=-3. Weekly leaderboard. Small entry fee, prize pool to top 3.*

55. **Polls / Predictions**
    - Predict match scores before kickoff.
    - **Prompt:** *In lobby (pre-match), show prediction poll: "Who wins?" Team A / Draw / Team B. Or score prediction (e.g. 2-1). Store predictions. After match, show who got it right. Award prediction streak badges. Leaderboard for most correct predictions.*

56. **In-App Currency (PlayCoins)**
    - Gamified points for engagement.
    - **Prompt:** *PlayCoins earned by: joining matches (10), rating teammates (5), referring friend (50), streak bonus (25). Spend on: profile customisations, highlight priority, early match access. Store in `playcoins` table. Show coin balance in header. Shop at `/shop`.*

57. **Match Spotify Playlist**
    - Collaborative playlist for pre-match hype.
    - **Prompt:** *Integrate Spotify Embed API. Organizer pastes Spotify playlist URL in match creation. In lobby, show embedded mini player. "Add your hype track" — participants suggest songs. Pre-match vibes. Shows playlist name and track count.*

58. **Post-Match Food & Drinks**
    - Suggest nearby spots for the team after the game.
    - **Prompt:** *After match, show "Where next?" card with 3 nearby restaurants/bars from Google Places API. Filter by: open now, budget, distance. One-tap navigation. Venue partnership: featured spots get highlighted placement. Revenue share option.*

59. **Player of the Month**
    - Automated based on matches, ratings, sportsmanship.
    - **Prompt:** *Cron job runs 1st of month. Calculate score = matches_joined * 10 + avg_rating * 20 + (-reports * 50). Winner gets "Player of the Month" badge on profile, home feed feature, and ₵50 wallet credit. Show Hall of Fame page with all past winners.*

60. **Birthday Match Reward**
    - Free match entry on player's birthday.
    - **Prompt:** *Check profiles.birthdate. On birthday, show confetti animation on home. "Happy Birthday! Your next match is on us" — waive entry fee (platform covers commission). Birthday badge for 24h. Notification to friends: "It's John's birthday — play with him!"*

---

## Venue Images Feature — Implementation Complete

**Migration:** `20260513160000_add_venue_images.sql`
- Adds `image_urls text[]` column to `venues` table

**Admin:** `AdminVenues.tsx` updated
- Thumbnail shown in venue table
- Upload button per venue row (inline)
- "Manage images" gallery modal per venue
- Image upload during new venue creation with preview grid
- Uses Supabase Storage bucket `venue-images`

**Client:**
- `CreateMatch.tsx` — venue list shows thumbnail (56x56 rounded)
- `Lobby.tsx` — hero image banner (16:9) for venue, "+N more" badge if multiple
- `useVenues.ts` — includes `image_urls` in type
- `useMatchLobby.ts` — fetches `image_urls` from venue join

**Required Setup:**
1. Run migration SQL
2. Create Supabase Storage bucket `venue-images` (public)
3. Add bucket RLS: allow uploads from authenticated users (admin uploads)

---

*Document generated for PlayReady Sports launch preparation.*
