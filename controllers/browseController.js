import { sql } from "../config/db.js";

/**
 * Helper: find city by name/name_ar
 */
async function findCityByQuery(cityQuery) {
  const rows = await sql`
    SELECT id, name, name_ar, center_lat, center_lng
    FROM cities
    WHERE LOWER(name) = LOWER(${cityQuery})
       OR name_ar = ${cityQuery}
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * GET /api/browse/cities
 */
export async function getAllCities(req, res) {
  try {
    const cities = await sql`
      SELECT id, name, name_ar, center_lat, center_lng
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
 * GET /api/browse/categories
 * Returns ALL categories (for "More" screen).
 */
export async function getAllCategories(req, res) {
  try {
    const cats = await sql`
      SELECT id, slug, name, name_ar
      FROM categories
      ORDER BY name ASC
    `;
    return res.status(200).json(cats);
  } catch (err) {
    console.error("getAllCategories error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/browse/categories/featured
 * Returns only the 4 main categories I want.
 * This matches using category.slug values.
 */
export async function getFeaturedCategories(req, res) {
  try {
    
    const FEATURED = ["restaurant", "park", "museum", "cafe"];

    const cats = await sql`
      SELECT id, slug, name, name_ar
      FROM categories
      WHERE slug = ANY(${FEATURED})
      ORDER BY
        CASE slug
          WHEN 'restaurant' THEN 1
          WHEN 'park' THEN 2
          WHEN 'museum' THEN 3
          WHEN 'cafe' THEN 4
          ELSE 99
        END
    `;
    return res.status(200).json(cats);
  } catch (err) {
    console.error("getFeaturedCategories error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/browse/locations?city=Ramallah&categorySlug=restaurant
 * - If categorySlug is provided -> filtered list
 * - Else -> all locations in that city
 */
export async function getLocationsByCity(req, res) {
  const cityQuery = (req.query.city || "").trim();
  const categorySlug = (req.query.categorySlug || "").trim().toLowerCase();

  if (!cityQuery) {
    return res.status(400).json({ message: "Missing city query param" });
  }

  try {
    const city = await findCityByQuery(cityQuery);
    if (!city) return res.status(404).json({ message: `City not found: ${cityQuery}` });

    let category = null;
    if (categorySlug) {
      const catRows = await sql`
        SELECT id, slug, name, name_ar
        FROM categories
        WHERE slug = ${categorySlug}
        LIMIT 1
      `;
      category = catRows[0];
      if (!category) {
        return res.status(404).json({ message: `Category not found: ${categorySlug}` });
      }
    }

    const locations = await sql`
      SELECT
        l.id,
        l.city_id,
        l.name,
        l.lat,
        l.lng,
        l.estimated_time,
        l.max_cost,
        l.rating,
        l.open_hours,
        l.closed_days,
        l.recommended_for,
        l.category_id,
        l.user_ratings_total,
        c.slug AS category_slug,
        c.name AS category_name,
        c.name_ar AS category_name_ar
      FROM locations l
      JOIN categories c ON c.id = l.category_id
      WHERE l.city_id = ${city.id}
        ${category ? sql`AND l.category_id = ${category.id}` : sql``}
      ORDER BY l.rating DESC NULLS LAST, l.user_ratings_total DESC NULLS LAST, l.name ASC
    `;

    return res.status(200).json({
      city,
      category,
      count: locations.length,
      locations,
    });
  } catch (err) {
    console.error("getLocationsByCity error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/browse/city-sections?city=Ramallah&limit=6
 * "Top" is based on rating (then user_ratings_total).
 */
export async function getCitySections(req, res) {
  const cityQuery = (req.query.city || "").trim();
  const limit = Number(req.query.limit || 6);

  if (!cityQuery) {
    return res.status(400).json({ message: "Missing city query param" });
  }

  try {
    const city = await findCityByQuery(cityQuery);
    if (!city) return res.status(404).json({ message: `City not found: ${cityQuery}` });

    
    const S = {
      restaurant: "restaurant",
      parks: "park",
      museum: "museum",
      cafe: "cafe",
    };

    // Fetch the category IDs for the 4 main sections
    const mainCats = await sql`
      SELECT id, slug, name, name_ar
      FROM categories
      WHERE slug = ANY(${[S.restaurant, S.parks, S.museum, S.cafe]})
    `;

    const catMap = new Map(mainCats.map((c) => [c.slug, c]));

    const restaurantCat = catMap.get(S.restaurant);
    const parksCat = catMap.get(S.parks);
    const museumCat = catMap.get(S.museum);
    const cafeCat = catMap.get(S.cafe);

    // If any is missing, fail clearly 
    const missing = [];
    if (!restaurantCat) missing.push(S.restaurant);
    if (!parksCat) missing.push(S.parks);
    if (!museumCat) missing.push(S.museum);
    if (!cafeCat) missing.push(S.cafe);

    if (missing.length) {
      return res.status(500).json({
        message: "Missing required category slugs in DB",
        missing_slugs: missing,
      });
    }

    // Helper query maker
    const fetchTop = async (categoryId) => {
      return await sql`
        SELECT
          l.id,
          l.city_id,
          l.name,
          l.lat,
          l.lng,
          l.estimated_time,
          l.max_cost,
          l.rating,
          l.open_hours,
          l.closed_days,
          l.recommended_for,
          l.category_id,
          l.user_ratings_total
        FROM locations l
        WHERE l.city_id = ${city.id}
          AND l.category_id = ${categoryId}
        ORDER BY l.rating DESC NULLS LAST, l.user_ratings_total DESC NULLS LAST, l.name ASC
        LIMIT ${limit}
      `;
    };

    const restaurants = await fetchTop(restaurantCat.id);
    const parks = await fetchTop(parksCat.id);
    const museums = await fetchTop(museumCat.id);
    const cafes = await fetchTop(cafeCat.id);

    // Other = exclude the 4 categories
    const other = await sql`
      SELECT
        l.id,
        l.city_id,
        l.name,
        l.lat,
        l.lng,
        l.estimated_time,
        l.max_cost,
        l.rating,
        l.open_hours,
        l.closed_days,
        l.recommended_for,
        l.category_id,
        l.user_ratings_total,
        c.slug AS category_slug,
        c.name AS category_name,
        c.name_ar AS category_name_ar
      FROM locations l
      JOIN categories c ON c.id = l.category_id
      WHERE l.city_id = ${city.id}
        AND l.category_id <> ALL(${[
          restaurantCat.id,
          parksCat.id,
          museumCat.id,
          cafeCat.id,
        ]})
      ORDER BY l.rating DESC NULLS LAST, l.user_ratings_total DESC NULLS LAST, l.name ASC
      LIMIT ${limit}
    `;

    return res.status(200).json({
      city,
      limit,
      sections: {
        restaurants,
        parks,
        museums,
        cafes,
        other,
      },
      meta: {
        mainCategories: {
          restaurant: restaurantCat,
          parks: parksCat,
          museum: museumCat,
          cafe: cafeCat,
        },
      },
    });
  } catch (err) {
    console.error("getCitySections error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/browse/location/:locationId
 * Returns 1 location from DB + its city + category info
 * NOTE: recommended_for returned as-is (TEXT[] or string), frontend will normalize safely.
 */
export async function getLocationById(req, res) {
  const { locationId } = req.params;

  if (!locationId) {
    return res.status(400).json({ message: "Missing locationId param" });
  }

  try {
    const rows = await sql`
      SELECT
        l.id,
        l.city_id,
        l.google_place_id,
        l.name,
        l.lat,
        l.lng,
        l.estimated_time,
        l.max_cost,
        l.rating,
        l.open_hours,
        l.closed_days,
        l.recommended_for,
        l.category_id,
        l.user_ratings_total,
        c.slug AS category_slug,
        c.name AS category_name,
        c.name_ar AS category_name_ar,
        ci.name AS city_name,
        ci.name_ar AS city_name_ar
      FROM locations l
      JOIN categories c ON c.id = l.category_id
      JOIN cities ci ON ci.id = l.city_id
      WHERE l.id = ${locationId}
      LIMIT 1
    `;

    const location = rows[0];

    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }

    return res.status(200).json({ location });
  } catch (err) {
    console.error("getLocationById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}





// import { sql } from "../config/db.js";

// /**
//  * GET /api/browse/cities
//  * Returns all cities (id, name, name_ar) ordered by name.
//  */
// export async function getAllCities(req, res) {
//   try {
//     const cities = await sql`
//       SELECT id, name, name_ar
//       FROM cities
//       ORDER BY name ASC
//     `;

//     return res.status(200).json(cities);
//   } catch (err) {
//     console.error("getAllCities error:", err);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// }

// /**
//  * GET /api/browse/locations?city=Ramallah
//  * Finds the city by (name or name_ar), then returns locations in that city.
//  */
// export async function getLocationsByCityName(req, res) {
//   const cityQuery = (req.query.city || "").trim();

//   if (!cityQuery) {
//     return res.status(400).json({
//       message: "Missing city query param. Example: /api/browse/locations?city=Ramallah",
//     });
//   }

//   try {
//     // 1) Find matching city (case-insensitive for English)
//     const cityRows = await sql`
//       SELECT id, name, name_ar
//       FROM cities
//       WHERE LOWER(name) = LOWER(${cityQuery})
//          OR name_ar = ${cityQuery}
//       LIMIT 1
//     `;

//     const city = cityRows[0];
//     if (!city) {
//       return res.status(404).json({
//         message: `City not found: ${cityQuery}`,
//       });
//     }

//     // 2) Fetch locations for that city_id
//     const locations = await sql`
//       SELECT
//         id,
//         city_id,
//         name,
//         google_place_id,
//         lat,
//         lng,
//         estimated_time,
//         max_cost,
//         rating,
//         open_hours,
//         closed_days,
//         recommended_for,
//         category_id,
//         user_ratings_total,
//         created_at,
//         updated_at
//       FROM locations
//       WHERE city_id = ${city.id}
//       ORDER BY rating DESC NULLS LAST, user_ratings_total DESC NULLS LAST, name ASC
//     `;

//     return res.status(200).json({
//       city,
//       count: locations.length,
//       locations,
//     });
//   } catch (err) {
//     console.error("getLocationsByCityName error:", err);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// }
