// import express from "express";
// import { getPlacePhoto } from "../controllers/photosController.js";

// const router = express.Router();

// // GET /api/photos/:photoReference?maxWidth=800
// router.get("/:photoReference", getPlacePhoto);

// export default router;

import express from "express";

const router = express.Router();

// GET /api/photos?ref=...&maxWidth=800
router.get("/", async (req, res) => {
    try {
        const ref = (req.query.ref || "").trim();
        const maxWidth = Number(req.query.maxWidth) || 800;

        if (!ref) return res.status(400).json({ message: "ref is required" });

        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) return res.status(500).json({ message: "GOOGLE_MAPS_API_KEY missing" });

        // Google Places Photos API v1 style (places.googleapis.com)
        const url =
            `https://places.googleapis.com/v1/${encodeURI(ref)}/media` +
            `?maxWidthPx=${encodeURIComponent(String(maxWidth))}` +
            `&key=${encodeURIComponent(apiKey)}`;

        const r = await fetch(url, { redirect: "follow" });

        if (!r.ok) {
            const text = await r.text().catch(() => "");
            return res.status(r.status).send(text || "Failed to fetch photo");
        }
        //
        // مرّري الصورة كما هي
        res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
        const buf = Buffer.from(await r.arrayBuffer());
        return res.status(200).send(buf);
    } catch (e) {
        console.error("photos endpoint error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
