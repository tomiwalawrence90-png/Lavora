/* LAVORA demo content (device-only). Turn off in Settings > Demo content. */
const _av = (e, a, b) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="50" font-size="46" text-anchor="middle" dominant-baseline="central">${e}</text></svg>`);
const SEED_USERS = {
  "seed-u1": { id: "seed-u1", username: "kemi_plays", display_name: "Kemi Adeyemi", avatar_url: _av("🎮", "#8b5cf6", "#3b82f6"), bio: "FC & eFootball every weekend. Ask me about formations.", country: "Nigeria", favorite_games: ["EA SPORTS FC", "eFootball", "FC Mobile"], created_at: "2026-09-02T10:00:00Z" },
  "seed-u2": { id: "seed-u2", username: "ghostrunner", display_name: "Tobi Okafor", avatar_url: _av("👾", "#ff5d7e", "#ff9a5d"), bio: "Valorant duelist main. Ranked grind never stops.", country: "Nigeria", favorite_games: ["Valorant", "Call of Duty Mobile", "Rainbow Six Siege"], created_at: "2026-09-10T10:00:00Z" },
  "seed-u3": { id: "seed-u3", username: "luna.craft", display_name: "Luna Martins", avatar_url: _av("🦊", "#12b886", "#3b82f6"), bio: "Building worlds in Minecraft and farming in Stardew.", country: "Ghana", favorite_games: ["Minecraft", "Stardew Valley", "The Sims 4"], created_at: "2026-08-21T10:00:00Z" },
  "seed-u4": { id: "seed-u4", username: "drift_king", display_name: "Chidi Eze", avatar_url: _av("🏆", "#f59e0b", "#ef4444"), bio: "Forza and Asphalt. Cars are life.", country: "Nigeria", favorite_games: ["Forza Horizon 5", "Asphalt Legends Unite", "Rocket League"], created_at: "2026-09-18T10:00:00Z" },
  "seed-u5": { id: "seed-u5", username: "sana_gg", display_name: "Sana Khalid", avatar_url: _av("👑", "#a855f7", "#f43f5e"), bio: "Elden Ring lore nerd. Still stuck on Malenia.", country: "Kenya", favorite_games: ["Elden Ring", "Genshin Impact", "League of Legends"], created_at: "2026-07-30T10:00:00Z" },
  "seed-u6": { id: "seed-u6", username: "nova_fn", display_name: "Nova Bello", avatar_url: _av("🚀", "#0ea5e9", "#22d3ee"), bio: "Fortnite creative maps + squads. DM for a duo.", country: "Nigeria", favorite_games: ["Fortnite", "Apex Legends", "Among Us"], created_at: "2026-10-05T10:00:00Z" }
};
const SEED_POST_DATA = [
  { id: "seed-1", u: "seed-u1", h: 1.5, likes: 48, text: "Just finished my Division Rivals season in EA FC. Went 9-1 with a 4-2-3-1 and a deep-lying playmaker. Who else is grinding this weekend? ⚽", img: "images/ea-sports-fc-banner.jpg" },
  { id: "seed-2", u: "seed-u2", h: 3, likes: 112, text: "Ace on Ascent with the Sheriff. I am still shaking 😭🔥", img: "images/valorant-banner.jpg" },
  { id: "seed-3", u: "seed-u3", h: 6, likes: 64, text: "Spent three days on this base. Every room has a secret door. Tell me what to add next!", img: "images/minecraft-banner.jpg" },
  { id: "seed-4", u: "seed-u5", h: 9, likes: 39, text: "Finally beat Margit on the first try after 20 attempts yesterday. Funny how that works. Any boss tips for Radahn?" },
  { id: "seed-5", u: "seed-u4", h: 14, likes: 87, text: "Sunset drift at the Mexico coast road. Photo mode in Forza Horizon 5 is unreal.", img: "images/forza-horizon-5-banner.jpg" },
  { id: "seed-6", u: "seed-u6", h: 20, likes: 23, text: "Looking for 2 players for Fortnite squads tonight around 9pm. Chill vibes only, mic optional. Drop a comment!" },
  { id: "seed-7", u: "seed-u2", h: 28, likes: 54, text: "Hot take: crosshair placement beats aim every time. Fight me in the comments." },
  { id: "seed-8", u: "seed-u1", h: 40, likes: 31, text: "eFootball weekend league is rough this week. Anyone running a 3-5-2 successfully?", img: "images/efootball-banner.jpg" },
  { id: "seed-9", u: "seed-u3", h: 52, likes: 76, text: "Stardew spring year 2 done: 100% shipping, finally got the golden clock. Farm tour soon 🌱" },
  { id: "seed-10", u: "seed-u5", h: 70, likes: 45, text: "Genshin new region is gorgeous. Pulled my first 5-star on the 40th wish!", img: "images/genshin-impact-banner.jpg" },
  { id: "seed-11", u: "seed-u6", h: 96, likes: 18, text: "Welcome to everyone who just joined LAVORA! Say hi and tell us your main game 👋" },
  { id: "seed-12", u: "seed-u4", h: 120, likes: 29, text: "Rocket League 2v2 tonight? Platinum level, no toxic please.", img: "images/rocket-league-banner.jpg" }
];
// [user, hours ago, text]
const SEED_COMMENT_DATA = {
  "seed-1": [["seed-u2", 1.2, "9-1 is crazy. Share the tactics!"], ["seed-u4", 1, "Deep playmaker is underrated"], ["seed-u3", .5, "Congrats Kemi 🎉"]],
  "seed-2": [["seed-u1", 2.8, "No way, clip it!"], ["seed-u6", 2.5, "Sheriff ace is the cleanest flex"], ["seed-u5", 2, "Teach me your ways 😂"], ["seed-u4", 1.5, "Legend"]],
  "seed-3": [["seed-u5", 5, "Add a lava trap behind the library door"], ["seed-u1", 4, "Incredible detail"]],
  "seed-4": [["seed-u3", 8, "Radahn: summon Ranni and keep your distance"], ["seed-u2", 7, "Welcome to the Lands Between 😅"]],
  "seed-5": [["seed-u6", 13, "That lighting!!"], ["seed-u1", 12, "Wallpaper material"], ["seed-u2", 10, "What car is that?"]],
  "seed-6": [["seed-u2", 19, "I'm in. What's your username?"], ["seed-u5", 18, "Count me in too"]],
  "seed-7": [["seed-u6", 27, "Facts. Pre-aim every angle."], ["seed-u4", 26, "Aim helps but yes, positioning wins"]],
  "seed-8": [["seed-u4", 39, "Try 4-3-3 attack, much safer"]],
  "seed-9": [["seed-u1", 51, "Golden clock is the dream"], ["seed-u5", 50, "Farm tour please!"]],
  "seed-10": [["seed-u3", 69, "Lucky!! I'm still at pity 70"], ["seed-u6", 68, "Which character?"]],
  "seed-11": [["seed-u1", 95, "Hi! Main is EA FC"], ["seed-u3", 94, "Minecraft all day 🌱"], ["seed-u2", 93, "Valorant. Add me!"]],
  "seed-12": [["seed-u6", 119, "I'll play, add me after 8"]]
};
const _ago = h => new Date(Date.now() - h * 3600e3).toISOString();
const seedPosts = () => SEED_POST_DATA.map(p => ({ id: p.id, user_id: p.u, content: p.text, image_url: p.img || null, created_at: _ago(p.h), seed_likes: p.likes }));
const seedComments = () => Object.fromEntries(Object.entries(SEED_COMMENT_DATA).map(([pid, arr]) => [pid, arr.map(([u, h, t], i) => ({ id: "sc-" + pid + "-" + i, user_id: u, name: SEED_USERS[u].display_name, content: t, created_at: _ago(h) }))]));
