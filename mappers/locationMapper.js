// wallet_api/mappers/locationMapper.js
export function mapLocationRow(row) {
    const ref = row.cover_photo_reference || null;

    // مهم: base URL من env عشان يشتغل محلياً وعلى Render
    const base =
        process.env.PUBLIC_BASE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        "";

    const coverPhotoReference = row.cover_photo_reference ?? null;

    const coverPhotoUrl =
        coverPhotoReference && base
            ? `${base}/api/photos?ref=${encodeURIComponent(coverPhotoReference)}&maxWidth=800`
            : null;

    return {
        id: row.id,
        cityId: row.city_id,
        name: row.name,
        //category: row.category,
        categoryId: row.category_id ?? null,
        categorySlug: row.category_slug ?? null,
        categoryName: row.category_name ?? null,
        categoryNameAr: row.category_name_ar ?? null,

        googlePlaceId: row.google_place_id,

        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,

        estimatedTime: row.estimated_time != null ? Number(row.estimated_time) : null,
        maxCost: row.max_cost != null ? Number(row.max_cost) : null,

        rating: row.rating != null ? Number(row.rating) : null,

        openHours: row.open_hours || null,
        closedDays: row.closed_days || [],
        recommendedFor: row.recommended_for || [],

        tripTypes: row.trip_types || [],

        // coverPhotoReference: ref,
        // coverPhotoUrl: ref ? `${base}/api/photos/${encodeURIComponent(ref)}?maxWidth=800` : null,
        // ✅ الصور:
        coverPhotoReference,
        coverPhotoUrl,
    };
}
