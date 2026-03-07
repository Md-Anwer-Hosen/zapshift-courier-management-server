const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.stwfv7r.mongodb.net/?appName=Cluster0`;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    const parcelCollection = client.db("zapshiftDB").collection("parcels");

    // Routes
    app.get("/", (req, res) => {
      res.send("Courier Server Running 🚚");
    });

    //save percel to db-->>

    app.post("/parcels", async (req, res) => {
      try {
        const data = req.body;
        const result = await parcelCollection.insertOne(data);
        res.status(201).send(result);
      } catch (err) {
        console.log("Error inserting parcel :", err);
        res.send(500).send({ message: "Failed to create parcel" });
      }
    });

    // Get all parcels from database (email)-->>

    app.get("/parcels/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ message: "Email is requried !" });
        }

        const query = { "sender.email": email };

        // creation_date: -1 (latest first)
        const result = await parcelCollection
          .find(query)
          .sort({ creation_date: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // get by id -->>

    app.get("/payment/:id", async (req, res) => {
      try {
        const id = req.params.id;

        console.log(id);

        const query = { _id: new ObjectId(id) };

        const result = await parcelCollection.findOne(query);

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // delete one parcel-->>

    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });

    //payment api-->>

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { cost } = req.body;

        const amount = parseInt(cost * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).send({ message: "Payment failed" });
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("Connection error:", error);
  }
}

run().catch(console.dir);

// Port Listen (Fixed Console Log)
app.listen(port, () => {
  console.log(`Server is running at port: ${port}`);
});
