# LAVORA 4.0

Same stack as 2.0 (static PWA + Supabase). Same tables: `profiles`, `posts`, `messages`. No migration needed.

## Optional: enable photo / video posts
The composer uploads media to a Supabase Storage bucket named `post-media`. Until it exists, posts fall back to text-only.
1. Supabase → Storage → New bucket → name `post-media` → **Public**.
2. Run in the SQL editor:
```sql
create policy "users upload own media" on storage.objects for insert to authenticated
with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
```

## Optional: show real names in feed/chat
Feed and chat show each person's display name/avatar if `profiles` is readable by logged-in users:
```sql
create policy "profiles readable by members" on profiles for select to authenticated using (true);
```
Otherwise they show "LAVORA Member" (as in 2.0).

## Deploying an update
Service-worker cache is now `lavora-v6`, so users get the new version automatically on next load.

## Profile photos
Profile photos are cropped square and uploaded to the same `post-media` bucket (folder = your user id). If the bucket isn't set up, a small embedded copy is saved in `profiles.avatar_url` instead, so photos work with no setup.

## Notes
- The "follow" icon on posts is saved on the device only until a `follows` table exists.

## What's new in 4.0
- **Sidebar menu** (hamburger, swipe-to-close; permanent on desktop): Home, Explore Games, Live Arena, Go Live Studio, Public Chat, Saved posts, Notifications, Search, Profile, Settings, Log out.
- **Home is now just the feed** (composer + posts with Everyone / Following / My posts filters).
- **Bottom bar**: Home, Games, Live, Chat, Profile.
- **New pages**: Games (moved from Home, includes My Games), Saved posts, Settings.
- **Post actions**: like, comment, save, share.
- **Works without a backend**: if Supabase is unreachable (or its script can't load) the app switches to on-device accounts, posts, chat, profiles and media. Likes, saves, comments, follows and notifications are always on-device.
- Browser back/forward and deep links (`#games`, `#settings`...), notification badge, loading skeletons, retry on feed errors, offline/online toasts, reduce-motion and autoplay settings.

## Game images
Each game uses `images/<slug>.jpg` (600×800 card art) and `images/<slug>-banner.jpg` (1600×600). Add a game by adding one `G("slug", "Name", "Category", "Platforms", "XX")` line in `script.js`.
Blood Strike and Mobile Legends have no photos, so they use their SVG art. A missing image falls back to the SVG, then to the gradient + monogram.
Used in: game grid, Featured banner carousel, game detail sheet, search results, My Games chips, profile banner (your first favourite game with a banner) and the Live Studio preview.

## Fonts
Outfit (UI) and Orbitron (LAVORA wordmark) load from Google Fonts; system fonts are the offline fallback. Change them in `index.html` and the `--font` / `--display` variables in `style.css`.

## 5.0 changes
- Light theme by default; dark mode toggle in the sidebar (saved on device).
- Post detail pages (`#post/<id>`) with comments, other users' profiles (`#user/<id>`).
- Sign-up onboarding: avatar + profile design, then favourite games. Shown to any account without a username.
- New logo and app icons. Service-worker cache is now `lavora-v9`.
- Viewing other people's profiles needs the `profiles readable by members` policy above.

## 6.0 changes

### Chat
- **Emoji picker** (Recent, Smileys, Gestures, Hearts, Gaming, Fun) and **stickers**: built-in *Gamer* text stickers, big-emoji stickers, and **My stickers**.
- **Custom stickers**: tap **Add** to turn any image (PNG/JPG/WebP/SVG, small GIFs stay animated) into a sticker. **Import pack / Export** share a `.json` pack between devices. In chat, use ⋯ → *Add to my stickers* / *Save as sticker* to steal one you like. Stickers are stored on the device (max 48) and uploaded to the `post-media` bucket when sent (falls back to embedding if the bucket isn't set up).
- **Send photos**: image button (or paste an image) → preview → optional caption → send. Tap a photo to open it full screen.
- **Edit and delete your own messages**: ⋯ on your message. Edited messages show an "edited" label. Changes appear live for everyone.
  **Run `supabase-chat-policies.sql` once** in the Supabase SQL editor, otherwise Supabase blocks edits/deletes.
- No new tables or columns. Photos/stickers/edited flags are encoded inside the existing `messages.content`.

### Login streak
- Opening LAVORA on a new day checks you in: a celebration sheet shows your flame, counter, the last 7 days, progress to the next reward and confetti on milestones (3, 7, 14, 30, 60, 100, 200, 365 …).
- Flame evolves by tier: Spark → Flame → Blaze → Inferno → Mythic (30+) → Legend (100+).
- Streak chip in the header, streak card on your profile. Missing a full day resets to 1 (your best is kept).
- Stored on the device per account (like follows/likes). Respects the "reduce motion" setting.
- Service-worker cache is now `lavora-v11`.
