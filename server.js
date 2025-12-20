import express from "express";
import "dotenv/config";
import { initDB } from "./config/db.js";
import reportsRouter from "./routers/reportsRouter.js";


const app = express();
app.use(express.json());


app.get("/", (req, res) => {
  res.send("Its working...this is my app");
});
app.use("/api/reports", reportsRouter);


const PORT = process.env.PORT || 5000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server is up and running on PORT:", PORT);
  });
});