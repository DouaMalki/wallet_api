import { sql } from "../config/db.js";

/**
 * GET /api/browse/cities
 * Returns all cities (id, name, name_ar) ordered by name.
 */
export async function getAllCities(req, res) {
  try {
    const cities = await sql`
      SELECT id, name, name_ar
      FROM cities
      ORDER BY name ASC
    `;

    return res.status(200).json(cities);
  } catch (err) {
    console.error("getAllCities error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/browse/locations?city=Ramallah
 * Finds the city by (name or name_ar), then returns locations in that city.
 */
export async function getLocationsByCityName(req, res) {
  const cityQuery = (req.query.city || "").trim();

  if (!cityQuery) {
    return res.status(400).json({
      message: "Missing city query param. Example: /api/browse/locations?city=Ramallah",
    });
  }

  try {
    // 1) Find matching city (case-insensitive for English)
    const cityRows = await sql`
      SELECT id, name, name_ar
      FROM cities
      WHERE LOWER(name) = LOWER(${cityQuery})
         OR name_ar = ${cityQuery}
      LIMIT 1
    `;

    const city = cityRows[0];
    if (!city) {
      return res.status(404).json({
        message: `City not found: ${cityQuery}`,
      });
    }

    // 2) Fetch locations for that city_id
    const locations = await sql`
      SELECT
        id,
        city_id,
        name,
        google_place_id,
        lat,
        lng,
        estimated_time,
        max_cost,
        rating,
        open_hours,
        closed_days,
        recommended_for,
        category_id,
        user_ratings_total,
        created_at,
        updated_at
      FROM locations
      WHERE city_id = ${city.id}
      ORDER BY rating DESC NULLS LAST, user_ratings_total DESC NULLS LAST, name ASC
    `;

    return res.status(200).json({
      city,
      count: locations.length,
      locations,
    });
  } catch (err) {
    console.error("getLocationsByCityName error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
