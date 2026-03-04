const { Router } = require("express");
const crypto = require("crypto");

const router = Router();

const SESSION_COOKIE = "pc_session";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 year

// Derive a stable userId from name + browser fingerprint
function nameToUserId(name, fingerprint) {
  const slug = name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (fingerprint && Object.keys(fingerprint).length > 0) {
    const raw = slug + "|" + JSON.stringify(fingerprint);
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8);
    return `user-${slug}-${hash}`;
  }
  return `user-${slug}`;
}

// GET /api/session — return existing session or null
router.get("/", (req, res) => {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie) {
    try {
      const session = JSON.parse(cookie);
      if (session.userId && session.name) {
        return res.json({ userId: session.userId, name: session.name });
      }
    } catch (_) {}
  }
  return res.json({ userId: null, name: null });
});

// POST /api/session — create or update session from a name + optional fingerprint
router.post("/", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }
  const fingerprint = req.body?.fingerprint || {};
  const userId = nameToUserId(name, fingerprint);
  const session = JSON.stringify({ userId, name });
  res.cookie(SESSION_COOKIE, session, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false, // must be readable by JS for local fallback
    sameSite: "lax",
  });
  return res.json({ userId, name });
});

module.exports = router;
