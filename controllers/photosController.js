export async function getPlacePhoto(req, res) {
    try {
        const { photoReference } = req.params;
        const maxWidth = Number(req.query.maxWidth || 800);

        if (!photoReference) return res.status(400).send("photoReference required");

        const key = process.env.GOOGLE_API_KEY;
        if (!key) return res.status(500).send("Missing GOOGLE_API_KEY");

        const w = Number.isFinite(maxWidth)
            ? Math.min(Math.max(maxWidth, 100), 2000)
            : 800;

        const url =
            `https://maps.googleapis.com/maps/api/place/photo` +
            `?maxwidth=${w}` +
            `&photo_reference=${encodeURIComponent(photoReference)}` +
            `&key=${encodeURIComponent(key)}`;

        const r = await fetch(url, { redirect: "follow" });

        if (!r.ok) {
            const txt = await r.text().catch(() => "");
            return res.status(r.status).send(txt || "Failed to fetch photo");
        }

        res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");

        const buf = Buffer.from(await r.arrayBuffer());
        return res.status(200).send(buf);
    } catch (e) {
        console.error("getPlacePhoto error:", e);
        return res.status(500).send("Server error");
    }
}
