// // wallet_api/repositories/savedTripPlansRepo.js
// import { sql } from "../config/db.js";

// /**
//  * tripRequest: payload from CreatePlan (destinationId, tripType, times, etc.)
//  * finalPlan: object keyed by YYYY-MM-DD -> { places:[...], totalHours, polyline, distance, duration }
//  *
//  * We store:
//  *  - saved_trip_plans (header/meta)
//  *  - saved_trip_plan_days (day + polyline/distance/duration)
//  *  - saved_trip_plan_items (ordered places)
//  */
// export async function createSavedTripPlan({
//     userId,
//     title = null,
//     answeredSurvey = false,
//     published = false,
//     tripRequest,
//     finalPlan,
// }) {
//     if (!userId) throw new Error("Missing userId");
//     if (!tripRequest?.destinationId) throw new Error("Missing destinationId");
//     if (!tripRequest?.tripType) throw new Error("Missing tripType");
//     if (!tripRequest?.startDate || !tripRequest?.endDate) throw new Error("Missing dates");
//     if (!finalPlan || typeof finalPlan !== "object") throw new Error("Missing finalPlan");

//     // Helpers: parse ISO -> date/time parts for Postgres
//     const toDateOnly = (iso) => new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD
//     const toTimeOnly = (iso) => {
//         if (!iso) return null;
//         const d = new Date(iso);
//         const hh = String(d.getHours()).padStart(2, "0");
//         const mm = String(d.getMinutes()).padStart(2, "0");
//         return `${hh}:${mm}:00`;
//     };

//     const cityId = tripRequest.destinationId; // cities.id is text: ramallah
//     const tripTypeSlug = tripRequest.tripType;

//     const startDate = toDateOnly(tripRequest.startDate);
//     const endDate = toDateOnly(tripRequest.endDate);

//     const tripStartTime = tripRequest.tripStartTime ? toTimeOnly(tripRequest.tripStartTime) : null;
//     const tripEndTime = tripRequest.tripEndTime ? toTimeOnly(tripRequest.tripEndTime) : null;

//     const tripDayTimes = tripRequest.tripDayTimes ?? {};
//     const placesPerDay = tripRequest.placesPerDay ?? {};
//     const selectedNights = tripRequest.selectedNights ?? [];

//     // Save everything in a single transaction
//     const result = await sql.begin(async (tx) => {
//         // 1) Insert plan header
//         const planRows = await tx`
//       INSERT INTO saved_trip_plans (
//         user_id, city_id, trip_type_slug,
//         title, audience_tag, transport_type, budget_max,
//         start_date, end_date,
//         trip_start_time, trip_end_time,
//         trip_day_times, places_per_day, selected_nights,
//         answered_survey, published
//       )
//       VALUES (
//         ${userId}, ${cityId}, ${tripTypeSlug},
//         ${title},
//         ${tripRequest.audienceTag ?? null},
//         ${tripRequest.transportType ?? null},
//         ${tripRequest.budgetMax ?? null},
//         ${startDate}, ${endDate},
//         ${tripStartTime}, ${tripEndTime},
//         ${JSON.stringify(tripDayTimes)}::jsonb,
//         ${JSON.stringify(placesPerDay)}::jsonb,
//         ${JSON.stringify(selectedNights)}::jsonb,
//         ${answeredSurvey}, ${published}
//       )
//       RETURNING id
//     `;

//         const planId = planRows[0].id;

//         // 2) Insert days + items
//         const dayKeys = Object.keys(finalPlan).sort(); // e.g. 2026-01-27

//         for (const dayKey of dayKeys) {
//             const dayObj = finalPlan[dayKey] || {};
//             const places = Array.isArray(dayObj.places) ? dayObj.places : [];

//             const dayRows = await tx`
//         INSERT INTO saved_trip_plan_days (
//           plan_id, day_key, total_hours,
//           polyline, distance_text, duration_text
//         )
//         VALUES (
//           ${planId},
//           ${dayKey}::date,
//           ${dayObj.totalHours ?? null},
//           ${dayObj.polyline ?? null},
//           ${dayObj.distance ?? null},
//           ${dayObj.duration ?? null}
//         )
//         RETURNING id
//       `;

//             const planDayId = dayRows[0].id;

//             // Insert items ordered
//             for (let i = 0; i < places.length; i++) {
//                 const p = places[i];
//                 const locationId = p?.id; // IMPORTANT: uuid from DB (you confirmed via logs)

//                 if (!locationId) {
//                     // Hard fail: because our schema requires location_id
//                     throw new Error(`Place missing id at day=${dayKey} index=${i}`);
//                 }

//                 // Optional timing fields (if you compute them on UI you can pass later; safe null now)
//                 await tx`
//           INSERT INTO saved_trip_plan_items (
//             plan_day_id, position, location_id, google_place_id,
//             start_time, end_time, duration_min
//           )
//           VALUES (
//             ${planDayId},
//             ${i + 1},
//             ${locationId}::uuid,
//             ${p.googlePlaceId ?? null},
//             ${null},
//             ${null},
//             ${p.estimatedTime ?? null}
//           )
//         `;
//             }
//         }

//         return { planId };
//     });

//     return result;
// }

// wallet_api/repositories/savedTripPlansRepo.js
import { sql } from "../config/db.js";

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
    const days = Array.isArray(finalPlan?.days) ? finalPlan.days : [];

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
