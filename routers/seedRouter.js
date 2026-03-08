import express from "express";
import { backfillGeminiController } from "../controllers/seedController.js";

const router = express.Router();

router.get("/backfill-gemini", backfillGeminiController);

export default router;

// import express from "express";
// import { refreshSeed, ensureSeed, ensureAllSeed, ensureMissingSeed } from "../controllers/seedController.js";

// const router = express.Router();

// //router.get("/refresh", refreshSeed);
// //router.get("/ensure", ensureSeed);
// //router.get("/ensure-all", ensureAllSeed);

// // GET /api/seed/refresh?cityId=ramallah&tripType=cultural
// router.get("/refresh", refreshSeed);

// // GET /api/seed/ensure-missing?cityId=ramallah&tripType=cultural&maxTotal=40&batch=5&pause=2000
// router.get("/ensure-missing", ensureMissingSeed);

// console.log("✅ seedRouter loaded");

// export default router;






// هاي اخر اشي عملتها comment
// import express from "express";
// import { ensureSeed, refreshSeed, ensureMissingSeed } from "../controllers/seedController.js";

// const router = express.Router();

// router.get("/refresh", refreshSeed);
// router.get("/ensure", ensureSeed);
// router.get("/ensure-missing", ensureMissingSeed);

// console.log("✅ seedRouter loaded");

// export default router;