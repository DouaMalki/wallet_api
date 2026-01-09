export function mapTripTypeRow(row) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        nameAr: row.name_ar ?? null,
    };
}
