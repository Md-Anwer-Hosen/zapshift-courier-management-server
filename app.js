const express = require("express");
const cors = require("cors");
require("dotenv").config();

const Stripe = require("stripe");

const client = require("./db");

const admin = require("firebase-admin");

const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64",
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());

async function run() {
  try {
    // await client.connect();

    const userCollection = client.db("zapshiftDB").collection("users");
    const parcelCollection = client.db("zapshiftDB").collection("parcels");
    const paymentCollection = client.db("zapshiftDB").collection("payments");
    const riderCollection = client.db("zapshiftDB").collection("riders");

    const collections = {
      userCollection,
      parcelCollection,
      paymentCollection,
      riderCollection,
      stripe,
    };

    app.locals.collections = collections;

    const userRoutes = require("./routes/userRoutes");
    const parcelRoutes = require("./routes/parcelRoutes");
    const riderRoutes = require("./routes/riderRoutes");
    const paymentRoutes = require("./routes/paymentRoutes");
    const dashboardRoutes = require("./routes/dashboardRoutes");

    app.get("/", (req, res) => {
      res.send("Courier Server Running 🚚");
    });

    app.use(userRoutes);
    app.use(parcelRoutes);
    app.use(riderRoutes);
    app.use(paymentRoutes);
    app.use(dashboardRoutes);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Connection error:", error);
  }
}

run().catch(console.dir);

module.exports = app;
