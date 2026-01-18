import express from "express";
import "dotenv/config";
import { initDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";
import job from "./config/cron.js";
// routers that will be used by the express app
import reportsRouter from "./routers/reportsRouter.js";
import locationsRouter from "./routers/locationsRouter.js";
import authenticationRouter from "./routers/authenticationRouter.js";
import editProfileRouter from "./routers/editProfileRouter.js";
import usersRouter from "./routers/usersRouter.js";
import citiesRouter from "./routers/citiesRouter.js";
import tripTypesRouter from "./routers/tripTypesRouter.js";
import tripTypeRulesRouter from "./routers/tripTypeRulesRouter.js";
import adminRouter from "./routers/adminRouter.js";
// import saveRouter from "./routers/saveRouter.js";
import categoriesRouter from "./routers/categoriesRouter.js";
import surveyRouter from "./routers/surveyRouter.js";
import browseRouter from "./routers/browseRouter.js";

const app = express();
if (process.env.NODE_ENV === "production") job.start();

// middleware
app.use(rateLimiter);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});



// routers created by doua
app.use("/api/reports", reportsRouter);
app.use("/api", authenticationRouter);
app.use("/api", editProfileRouter);
app.use("/api", surveyRouter);


// routers created by jenin
app.use("/api/users", usersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/browse", browseRouter);


// routers created by shahd
app.use("/api/locations", locationsRouter);
app.use("/api/cities", citiesRouter);
app.use("/api/trip-types", tripTypesRouter);
app.use("/api/trip_type_rules", tripTypeRulesRouter);
app.use("/api/categories", categoriesRouter);


// app.use("/api/saved-locations", saveRouter);


// To test that the application connected to the database
const PORT = process.env.PORT || 5000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server is up and running on PORT:", PORT);
  });
});
