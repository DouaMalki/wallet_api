export function mapCityRow(row) {
    return {
        id: row.id,
        name: row.name,
        nameAr: row.name_ar ?? null,
        lat: row.center_lat != null ? Number(row.center_lat) : null,
        lng: row.center_lng != null ? Number(row.center_lng) : null,
    };
}
