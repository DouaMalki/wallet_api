const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toHHMM(h, m) {
    const hh = String(h ?? 0).padStart(2, "0");
    const mm = String(m ?? 0).padStart(2, "0");
    return `${hh}:${mm}`;
}

function mapGoogleOpeningToSimple(openHoursJson) {
    // openHoursJson = regularOpeningHours من Google
    if (!openHoursJson || typeof openHoursJson !== "object") return null;

    const periods = Array.isArray(openHoursJson.periods) ? openHoursJson.periods : [];
    if (!periods.length) return null;

    const out = {};

    for (const p of periods) {
        const o = p?.open;
        const c = p?.close;

        if (!o || o.day == null || o.hour == null) continue;
        const dayKey = dow[o.day]; // 0..6

        const openStr = toHHMM(o.hour, o.minute);
        // لو ما في close (24h) -> خليه 23:59
        const closeStr = c && c.hour != null ? toHHMM(c.hour, c.minute) : "23:59";

        out[dayKey] = { open: openStr, close: closeStr };
    }

    return Object.keys(out).length ? out : null;
}

function toHHMM(hour = 0, minute = 0) {
    const h = String(hour).padStart(2, "0");
    const m = String(minute).padStart(2, "0");
    return `${h}:${m}`;
}

function normalizeOpenHours(googleRegularOpeningHours) {
    if (!googleRegularOpeningHours) return null;

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const out = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

    const wd = googleRegularOpeningHours.weekdayDescriptions || [];
    const is24hAllWeek =
        Array.isArray(wd) &&
        wd.length === 7 &&
        wd.every((s) => typeof s === "string" && s.toLowerCase().includes("open 24 hours"));

    // 24h pattern
    if (is24hAllWeek) {
        for (const k of Object.keys(out)) out[k] = { open: "00:00", close: "23:59" };
        return out;
    }

    const periods = Array.isArray(googleRegularOpeningHours.periods)
        ? googleRegularOpeningHours.periods
        : [];

    // إذا في periods فيها open بدون close (شائع في 24h) اعتبريه 24h
    const hasOpenOnly = periods.some((p) => p?.open && !p?.close);
    if (hasOpenOnly) {
        for (const k of Object.keys(out)) out[k] = { open: "00:00", close: "23:59" };
        return out;
    }

    // نجمع لكل يوم: أصغر open وأكبر close
    const agg = {
        sun: { openMin: null, closeMax: null },
        mon: { openMin: null, closeMax: null },
        tue: { openMin: null, closeMax: null },
        wed: { openMin: null, closeMax: null },
        thu: { openMin: null, closeMax: null },
        fri: { openMin: null, closeMax: null },
        sat: { openMin: null, closeMax: null },
    };

    const timeToMinutes = (hhmm) => {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
    };

    for (const p of periods) {
        if (!p?.open || !p?.close) continue;

        const openDay = days[p.open.day];
        const closeDay = days[p.close.day];

        const openHHMM = toHHMM(p.open.hour ?? 0, p.open.minute ?? 0);
        const closeHHMM = toHHMM(p.close.hour ?? 0, p.close.minute ?? 0);

        // إذا الإغلاق بيوم ثاني (يمتد لليوم التالي)،
        // TripEngine عندك لا يدعم crossing-midnight بشكل ممتاز،
        // فبنقربها عمليًا: نعتبره مفتوح لحد 23:59 لذلك اليوم.
        const crossesMidnight = openDay !== closeDay;
        const effectiveClose = crossesMidnight ? "23:59" : closeHHMM;

        const a = agg[openDay];
        const oMin = a.openMin;
        const cMax = a.closeMax;

        if (!oMin || timeToMinutes(openHHMM) < timeToMinutes(oMin)) a.openMin = openHHMM;
        if (!cMax || timeToMinutes(effectiveClose) > timeToMinutes(cMax)) a.closeMax = effectiveClose;
    }

    // بنركّب الناتج النهائي
    for (const k of Object.keys(out)) {
        const a = agg[k];
        if (a.openMin && a.closeMax) out[k] = { open: a.openMin, close: a.closeMax };
        else out[k] = null; // مغلق أو لا يوجد بيانات
    }

    return out;
}


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

    const simpleOpen = mapGoogleOpeningToSimple(row.open_hours);

    return {
        id: row.id,
        cityId: row.city_id,
        name: row.name,
        categoryId: row.category_slug ?? null,
        categoryUuid: row.category_id ?? null,
        //categoryId: row.category_id ?? null,
        categorySlug: row.category_slug ?? null,
        categoryName: row.category_name ?? null,
        categoryNameAr: row.category_name_ar ?? null,

        googlePlaceId: row.google_place_id,

        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,

        estimatedTime: row.estimated_time != null ? Number(row.estimated_time) : null,
        maxCost: row.max_cost != null ? Number(row.max_cost) : null,

        rating: row.rating != null ? Number(row.rating) : null,

        //openHours: simpleOpen,
        openHours: normalizeOpenHours(row.open_hours) || null,
        openHoursRaw: row.open_hours || null, //بيانات Google الأصلية
        //openHours: row.open_hours || null,
        closedDays: row.closed_days || [],
        recommendedFor: row.recommended_for || [],

        tripTypes: row.trip_types || [],

        coverPhotoReference,
        coverPhotoUrl,
    };
}
