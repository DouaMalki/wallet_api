// wallet_api/repositories/savedTripPlansRepo.js
import { sql } from "../config/db.js";

const TRIP_TZ = process.env.TRIP_TZ || "Asia/Hebron";

function isoToDateOnly(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TRIP_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);

    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
}

function isoToTimeOnly(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TRIP_TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(d);

    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("hour")}:${get("minute")}:${get("second")}`; // HH:MM:SS
}

function getHmInTZ(iso) {
    const t = isoToTimeOnly(iso);
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { h, m };
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
                polyline: dayObj.polyline ?? "",
                distanceText: dayObj.distance ?? dayObj.distance_text ?? "",
                durationText: dayObj.duration ?? dayObj.duration_text ?? "",
                legDurationsMin: Array.isArray(dayObj.legDurationsMin) ? dayObj.legDurationsMin : [],
                places: Array.isArray(dayObj.places) ? dayObj.places : [],
            };
        });
}


function timeOnlyFromIso(iso, fallbackHHMMSS) {
    if (!iso) return fallbackHHMMSS; // "HH:MM:SS"
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallbackHHMMSS;
    return d.toISOString().slice(11, 19); // UTC time-only
}

function getDayWindowIso(tripRequest, dayKey) {
    const perDay = tripRequest?.tripDayTimes?.[dayKey];
    if (perDay?.start && perDay?.end) {
        return { startIso: perDay.start, endIso: perDay.end };
    }
    if (tripRequest?.tripStartTime && tripRequest?.tripEndTime) {
        return { startIso: tripRequest.tripStartTime, endIso: tripRequest.tripEndTime };
    }
    return { startIso: null, endIso: null };
}

// function getDayTotalHours(tripRequest, dayKey) {
//     const { startIso, endIso } = getDayWindowIso(tripRequest, dayKey);

//     if (!startIso || !endIso) {
//         // fallback window: 10:00-17:00 => 7 hours
//         return 7;
//     }

//     const s = new Date(startIso);
//     const e = new Date(endIso);
//     const diffMs = e.getTime() - s.getTime();
//     if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;

//     return diffMs / (60 * 60 * 1000);
// }
function getDayTotalHours(tripRequest, dayKey) {
    const perDay = tripRequest?.tripDayTimes?.[dayKey];

    let startIso = null, endIso = null;

    if (perDay?.start && perDay?.end) {
        startIso = perDay.start;
        endIso = perDay.end;
    } else if (tripRequest?.tripStartTime && tripRequest?.tripEndTime) {
        startIso = tripRequest.tripStartTime;
        endIso = tripRequest.tripEndTime;
    } else {
        return 7; // fallback
    }

    const sHM = getHmInTZ(startIso);
    const eHM = getHmInTZ(endIso);
    if (!sHM || !eHM) return 7;

    const startMin = sHM.h * 60 + sHM.m;
    const endMin = eHM.h * 60 + eHM.m;
    if (endMin <= startMin) return 0;

    return (endMin - startMin) / 60;
}

function getDayWindowMinutes(tripRequest, dayKey) {
    const perDay = tripRequest?.tripDayTimes?.[dayKey];

    let startIso = null, endIso = null;

    if (perDay?.start && perDay?.end) {
        startIso = perDay.start;
        endIso = perDay.end;
    } else if (tripRequest?.tripStartTime && tripRequest?.tripEndTime) {
        startIso = tripRequest.tripStartTime;
        endIso = tripRequest.tripEndTime;
    } else {
        return { startMin: 10 * 60, endMin: 17 * 60 };
    }

    const sHM = getHmInTZ(startIso);
    const eHM = getHmInTZ(endIso);

    if (!sHM || !eHM) return { startMin: 10 * 60, endMin: 17 * 60 };

    const startMin = sHM.h * 60 + sHM.m;
    const endMin = eHM.h * 60 + eHM.m;

    if (endMin <= startMin) return { startMin: 10 * 60, endMin: 17 * 60 };

    return { startMin, endMin };
}

function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:00`;
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

    const startDate = isoToDateOnly(tripRequest.startDate);
    const endDate = isoToDateOnly(tripRequest.endDate);

    const tripStartTime = isoToTimeOnly(tripRequest.tripStartTime);
    const tripEndTime = isoToTimeOnly(tripRequest.tripEndTime);

    function timeToMinutes(hhmmss) {
        // "HH:MM:SS" or "HH:MM"
        if (!hhmmss) return null;
        const [h, m, s] = String(hhmmss).split(":").map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h * 60 + m;
    }



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
    // 2) Insert days into saved_trip_plan_days + items into saved_trip_plan_items
    const days = extractDays(finalPlan);
    if (!days.length) throw new Error("finalPlan has no YYYY-MM-DD keys");



    // for (const d of days) {
    //     const dayRes = await sql`
    //   INSERT INTO saved_trip_plan_days (
    //     plan_id,
    //     day_key,
    //     total_hours,
    //     polyline,
    //     distance_text,
    //     duration_text,
    //     created_at
    //   )
    //   VALUES (
    //     ${planId},
    //     ${d.dayKey}::date,
    //     ${polylineSafe},
    //     ${d.distanceText ?? null},
    //     ${d.durationText ?? null},
    //     NOW()
    //   )
    //   RETURNING id
    // `;

    //     const planDayId = dayRes?.[0]?.id;
    //     if (!planDayId) throw new Error("Failed to create saved_trip_plan_days row");

    //     // Insert items
    //     for (let i = 0; i < d.places.length; i++) {
    //         const p = d.places[i] || {};
    //         const locationId = p.id; // uuid NOT NULL in your DB

    //         if (!locationId) {
    //             throw new Error(`Place missing id at day ${d.dayKey}, position ${i + 1}`);
    //         }

    //         const durationMin =
    //             p.estimatedTime != null && Number.isFinite(Number(p.estimatedTime))
    //                 ? Number(p.estimatedTime)
    //                 : null;

    //         await sql`
    //     INSERT INTO saved_trip_plan_items (
    //       plan_day_id,
    //       position,
    //       location_id,
    //       google_place_id,
    //       start_time,
    //       end_time,
    //       duration_min,
    //       created_at
    //     )
    //     VALUES (
    //       ${planDayId},
    //       ${i + 1},
    //       ${locationId},
    //       ${p.googlePlaceId ?? null},
    //       NULL,
    //       NULL,
    //       ${durationMin},
    //       NOW()
    //     )
    //   `;
    //     }
    // }

    for (const d of days) {
        const totalHours = getDayTotalHours(tripRequest, d.dayKey);
        const polylineSafe = (d.polyline ?? "") || ""; // always string
        const legDurationsMin = Array.isArray(d.legDurationsMin) ? d.legDurationsMin : [];
        //  travel times من Google legs (بالدقائق) - ديناميكي
        //const legs = Array.isArray(d.legDurationsMin) ? d.legDurationsMin : [];

        const dayRes = await sql`
  INSERT INTO saved_trip_plan_days (
    plan_id,
    day_key,
    total_hours,
    polyline,
    distance_text,
    duration_text,
    leg_durations_min,
    created_at
  )
  VALUES (
    ${planId},
    ${d.dayKey}::date,
    ${totalHours},
    ${polylineSafe},
    ${d.distanceText ?? ""},
    ${d.durationText ?? ""},
    ${JSON.stringify(d.legDurationsMin ?? [])}::jsonb,
    NOW()
  )
  RETURNING id
`;

        const planDayId = dayRes?.[0]?.id;
        if (!planDayId) throw new Error("Failed to create saved_trip_plan_days row");

        const legs = legDurationsMin;



        // وقت بداية/نهاية اليوم (بالدقائق) حسب إدخال المستخدم
        const { startMin, endMin } = getDayWindowMinutes(tripRequest, d.dayKey);

        let cursorMin = startMin;

        for (let i = 0; i < d.places.length; i++) {
            const p = d.places[i] || {};
            const locationId = p.id;

            if (!locationId) {
                throw new Error(`Place missing id at day ${d.dayKey}, position ${i + 1}`);
            }

            // مدة الزيارة (بالدقائق)
            const durationMin =
                p.estimatedTime != null && Number.isFinite(Number(p.estimatedTime))
                    ? Math.max(1, Math.round(Number(p.estimatedTime)))
                    : 60; // fallback بدل NULL

            const itemStart = cursorMin;
            const itemEnd = cursorMin + durationMin;

            // (اختياري) حماية: لا تتجاوز نهاية اليوم — حسب سياستك
            // إذا بدك تمنعي الحفظ لو تجاوز:
            // if (itemEnd > endMin) break;
            // أو خزّني عادي (أنصح تخزني عادي وتتركي UI ينبه)

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
        ${minutesToTime(itemStart)}::time,
        ${minutesToTime(itemEnd)}::time,
        ${durationMin},
        NOW()
      )
    `;

            // انتقل للمكان التالي: زيارة + travel من Google
            const travelToNext =
                i < d.places.length - 1 ? (Number(legs[i]) || 0) : 0;

            cursorMin = itemEnd + travelToNext;
        }
    }

    return { planId };
}