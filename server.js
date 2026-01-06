import express from "express";
import "dotenv/config";
import { initDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";
import job from "./config/cron.js";
// routers that will be used by the express app
import reportsRouter from "./routers/reportsRouter.js";
<<<<<<< HEAD
import locationsRouter from "./routers/locationsRouter.js";

=======
import authenticationRouter from "./routers/authenticationRouter.js";
import usersRouter from "./routers/usersRouter.js";
>>>>>>> 9bc77628560f50063f1561410aed4b306c5881f8

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
app.use("/api/locations", locationsRouter);

<<<<<<< HEAD
console.log("✅ server.js loaded - mounting /api/locations");
=======
app.use("/api/users", usersRouter);

app.use("/api", authenticationRouter);
>>>>>>> 9bc77628560f50063f1561410aed4b306c5881f8


// To test that the application connected to the database
const PORT = process.env.PORT || 5000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server is up and running on PORT:", PORT);
  });
});
