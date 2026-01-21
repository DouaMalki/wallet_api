// wallet_api/repositories/savedTripPlansRepo.js
import { sql } from "../config/db.js";

// Convert ISO date string -> "YYYY-MM-DD" for DATE columns
function isoToDateOnly(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

// Convert ISO datetime -> "HH:MM:SS" for TIME columns
function isoToTimeOnly(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(11, 19);
}

// finalPlan: { "YYYY-MM-DD": { places:[...], polyline, distance, duration }, ... }
function extractDays(finalPlan) {
    if (!finalPlan || typeof finalPlan !== "object") return [];
    return Object.keys(finalPlan)
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
        .sort()
        .map((dayKey) => {
            const dayObj = finalPlan[dayKey] || {};
            return {
                dayKey,
                polyline: dayObj.polyline ?? null,
                distanceText: dayObj.distance ?? dayObj.distance_text ?? null,
                durationText: dayObj.duration ?? dayObj.duration_text ?? null,
                places: Array.isArray(dayObj.places) ? dayObj.places : [],
            };
        });
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

    // ---- map tripRequest -> saved_trip_plans columns ----
    const cityId = tripRequest.destinationId;   // text NOT NULL
    const tripTypeSlug = tripRequest.tripType;  // text NOT NULL

    const startDate = isoToDateOnly(tripRequest.startDate); // date NOT NULL
    const endDate = isoToDateOnly(tripRequest.endDate);     // date NOT NULL

    const tripStartTime = isoToTimeOnly(tripRequest.tripStartTime); // time nullable
    const tripEndTime = isoToTimeOnly(tripRequest.tripEndTime);     // time nullable

    if (!cityId) throw new Error("Missing tripRequest.destinationId");
    if (!tripTypeSlug) throw new Error("Missing tripRequest.tripType");
    if (!startDate) throw new Error("Invalid tripRequest.startDate");
    if (!endDate) throw new Error("Invalid tripRequest.endDate");

    // jsonb NOT NULL columns in your table
    const tripDayTimes = tripRequest.tripDayTimes ?? {};
    const placesPerDay = tripRequest.placesPerDay ?? {};
    const selectedNights = tripRequest.selectedNights ?? [];

    // 1) Insert header into saved_trip_plans
    const headerRes = await sql`
    INSERT INTO saved_trip_plans (
      user_id,
      city_id,
      trip_type_slug,
      title,
      audience_tag,
      transport_type,
      budget_max,
      start_date,
      end_date,
      trip_start_time,
      trip_end_time,
      trip_day_times,
      places_per_day,
      selected_nights,
      answered_survey,
      published,
      saved,
      confirmed,
      created_at,
      updated_at
    )
    VALUES (
      ${userId},
      ${cityId},
      ${tripTypeSlug},
      ${title ?? null},
      ${tripRequest.audienceTag ?? null},
      ${tripRequest.transportType ?? null},
      ${tripRequest.budgetMax ?? null},
      ${startDate}::date,
      ${endDate}::date,
      ${tripStartTime ?? null}::time,
      ${tripEndTime ?? null}::time,
      ${JSON.stringify(tripDayTimes)}::jsonb,
      ${JSON.stringify(placesPerDay)}::jsonb,
      ${JSON.stringify(selectedNights)}::jsonb,
      ${answeredSurvey},
      ${published},
      ${true},
      ${false},
      NOW(),
      NOW()
    )
    RETURNING id
  `;

    const planId = headerRes?.[0]?.id;
    if (!planId) throw new Error("Failed to create saved_trip_plans row");

    // 2) Insert days into saved_trip_plan_days + items into saved_trip_plan_items
    const days = extractDays(finalPlan);
    if (!days.length) throw new Error("finalPlan has no YYYY-MM-DD keys");

    for (const d of days) {
        const dayRes = await sql`
      INSERT INTO saved_trip_plan_days (
        plan_id,
        day_key,
        total_hours,
        polyline,
        distance_text,
        duration_text,
        created_at
      )
      VALUES (
        ${planId},
        ${d.dayKey}::date,
        NULL,
        ${d.polyline ?? null},
        ${d.distanceText ?? null},
        ${d.durationText ?? null},
        NOW()
      )
      RETURNING id
    `;

        const planDayId = dayRes?.[0]?.id;
        if (!planDayId) throw new Error("Failed to create saved_trip_plan_days row");

        // Insert items
        for (let i = 0; i < d.places.length; i++) {
            const p = d.places[i] || {};
            const locationId = p.id; // uuid NOT NULL in your DB

            if (!locationId) {
                throw new Error(`Place missing id at day ${d.dayKey}, position ${i + 1}`);
            }

            const durationMin =
                p.estimatedTime != null && Number.isFinite(Number(p.estimatedTime))
                    ? Number(p.estimatedTime)
                    : null;

            await sql`
        INSERT INTO saved_trip_plan_items (
          plan_day_id,
          position,
          location_id,
          google_place_id,
          start_time,
          end_time,
          duration_min,
          created_at
        )
        VALUES (
          ${planDayId},
          ${i + 1},
          ${locationId},
          ${p.googlePlaceId ?? null},
          NULL,
          NULL,
          ${durationMin},
          NOW()
        )
      `;
        }
    }

    return { planId };
}