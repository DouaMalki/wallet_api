// wallet_api/repositories/savedTripPlansRepo.js
import { sql } from "../config/db.js";

// يقبل شكلين:
// 1) finalPlan = { summary, days:[...] }
// 2) finalPlan = { "YYYY-MM-DD": { places:[...], polyline, distance, duration }, ... }
function normalizeDays(finalPlan, tripRequest) {
    // شكل days الجاهز
    if (Array.isArray(finalPlan?.days)) return finalPlan.days;

    // شكل TripPlan القديم (مفاتيح تواريخ)
    if (finalPlan && typeof finalPlan === "object") {
        const dateKeys = Object.keys(finalPlan)
            .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
            .sort();

        return dateKeys.map((dateKey) => {
            const dayObj = finalPlan[dateKey] || {};
            const places = Array.isArray(dayObj.places) ? dayObj.places : [];

            return {
                date: dateKey,
                startTime: tripRequest?.tripStartTime ?? null,
                endTime: tripRequest?.tripEndTime ?? null,

                // عندك في الجدول: distance_meters / duration_seconds
                // بينما TripPlan عندك قد يعطي distance/duration نص أو رقم
                // خليهم null إذا ما بدك تحويل الآن
                polyline: dayObj.polyline ?? null,
                distanceMeters: dayObj.distance_meters ?? dayObj.distanceMeters ?? null,
                durationSeconds: dayObj.duration_seconds ?? dayObj.durationSeconds ?? null,

                items: places.map((p, idx) => ({
                    order: idx + 1,
                    categorySlug: p.categorySlug ?? null,
                    place: {
                        id: p.id ?? null,
                        googlePlaceId: p.googlePlaceId ?? null,
                        name: p.name ?? null,
                        lat: p.lat ?? null,
                        lng: p.lng ?? null,
                        estimatedTime: p.estimatedTime ?? null,
                        maxCost: p.maxCost ?? null,
                        coverPhotoUrl: p.coverPhotoUrl ?? null,
                        coverPhotoReference: p.coverPhotoReference ?? null,
                    },
                })),
            };
        });
    }

    return [];
}

export async function createSavedTripPlan({
    userId,
    title,
    answeredSurvey = false,
    published = false,
    tripRequest,
    finalPlan,
}) {
    if (!userId) throw new Error("Missing userId");
    if (!tripRequest) throw new Error("Missing tripRequest");
    if (!finalPlan) throw new Error("Missing finalPlan");

    const days = normalizeDays(finalPlan, tripRequest);
    if (!days.length) throw new Error("finalPlan has no days to save");

    // 1) Insert header
    const headerRes = await sql`
    INSERT INTO saved_trip_plans (
      user_id,
      title,
      answered_survey,
      published,
      trip_request,
      created_at,
      updated_at
    )
    VALUES (
      ${userId},
      ${title},
      ${answeredSurvey},
      ${published},
      ${sql.json(tripRequest)},
      NOW(),
      NOW()
    )
    RETURNING id
  `;

    const planId = headerRes?.[0]?.id;
    if (!planId) throw new Error("Failed to create saved_trip_plans row");

    // 2) Insert days + items
    for (const day of days) {
        const dayRes = await sql`
      INSERT INTO saved_trip_plan_days (
        plan_id,
        day_date,
        start_time,
        end_time,
        polyline,
        distance_meters,
        duration_seconds
      )
      VALUES (
        ${planId},
        ${day.date},
        ${day.startTime ?? null},
        ${day.endTime ?? null},
        ${day.polyline ?? null},
        ${day.distanceMeters ?? null},
        ${day.durationSeconds ?? null}
      )
      RETURNING id
    `;

        const dayId = dayRes?.[0]?.id;
        if (!dayId) throw new Error("Failed to create saved_trip_plan_days row");

        const items = Array.isArray(day?.items) ? day.items : [];
        for (const it of items) {
            const place = it.place || {};

            await sql`
        INSERT INTO saved_trip_plan_items (
          day_id,
          item_order,
          category_slug,
          location_id,
          google_place_id,
          place_snapshot
        )
        VALUES (
          ${dayId},
          ${it.order ?? null},
          ${it.categorySlug ?? null},
          ${place.id ?? null},
          ${place.googlePlaceId ?? null},
          ${sql.json(place)}
        )
      `;
        }
    }

    return { planId };
}
