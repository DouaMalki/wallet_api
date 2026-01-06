import { neon } from "@neondatabase/serverless";
import "dotenv/config";

// Create SQL connection using the DataBase_URL
export const sql = neon(process.env.DataBase_URL);

// Test the database connection
export async function initDB() {
  try {
    //await sql`SELECT * from reports`;
    await sql`SELECT 1`;
    console.log("Database Connected successfully");
  } catch (error) {
    console.log("Error connecting the Database: ", error);
    // status code 1 means failure, 0 success
    process.exit(1);
  }
}

export async function initDBUsers() {
  try {
    await sql`SELECT * from users`;
    console.log("Database Connected successfully");
  } catch (error) {
    console.log("Error connecting the Database: ", error);
    // status code 1 means failure, 0 success
    process.exit(1);
  }
}