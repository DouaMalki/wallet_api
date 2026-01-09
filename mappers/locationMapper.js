// wallet_api/mappers/locationMapper.js
export function mapLocationRow(row) {
    return {
        id: row.id,
        cityId: row.city_id,

        name: row.name,
        category: row.category,

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
    };
}
