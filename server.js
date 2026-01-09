import express from "express";
import "dotenv/config";
import { initDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";
import job from "./config/cron.js";
// routers that will be used by the express app
import reportsRouter from "./routers/reportsRouter.js";
import authenticationRouter from "./routers/authenticationRouter.js";
import editProfileRouter from "./routers/editProfileRouter.js";

const app = express();
if (process.env.NODE_ENV === "production") job.start();
// middleware
app.use(rateLimiter);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});




// routers used by the express app
app.use("/api/reports", reportsRouter);
app.use("/api", authenticationRouter);
app.use("/api", editProfileRouter);

// To test that the application connected to the database
const PORT = process.env.PORT || 5000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server is up and running on PORT:", PORT);
  });
});