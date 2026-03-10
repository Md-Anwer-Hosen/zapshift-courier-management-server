const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");

const serviceAccount = require("./zapshift-firebase-auth-config.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

    const userCollection = client.db("zapshiftDB").collection("users");
    const parcelCollection = client.db("zapshiftDB").collection("parcels");
    const paymentCollection = client.db("zapshiftDB").collection("payments");
    const riderCollection = client.db("zapshiftDB").collection("riders");

    // custom middlewares-->>

    const verifyFbToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "Unauthorized access!" });
      }

      const token = authHeader.split(" ")[1];

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (err) {
        return res.status(403).send({ message: "Forbidden access!" });
      }
    };

    // Routes

    app.get("/", (req, res) => {
      res.send("Courier Server Running 🚚");
    });

    //save usere in db-->>

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };

      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        const updateDoc = {
          $set: {
            last_login: new Date().toISOString(),
          },
        };

        await userCollection.updateOne(query, updateDoc);
        return res.send({ message: "last login updated" });
      }

      const newUser = {
        ...user,
        created_at: user.created_at || new Date().toISOString(),
        last_login: new Date().toISOString(),
      };

      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    //save percel to db-->>

    app.post("/parcels", verifyFbToken, async (req, res) => {
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

    app.get("/parcels/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is requried !" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
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

    app.get("/paymentParcel/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        const query = { _id: new ObjectId(id) };
        const result = await parcelCollection.findOne(query);

        if (result.sender.email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // delete one parcel-->>

    app.delete("/parcels/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      if (parcel.sender.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });

    //insert a rider

    app.post("/rider", verifyFbToken, async (req, res) => {
      try {
        const rider = req.body;

        const email = rider.email;

        // check existing rider request
        const existingRider = await riderCollection.findOne({ email });

        if (existingRider) {
          return res.send({
            message: "Rider request already submitted",
            inserted: false,
          });
        }

        const riderData = {
          ...rider,
          status: "pending",
          created_at: new Date().toISOString(),
        };

        const result = await riderCollection.insertOne(riderData);

        res.send(result);
      } catch (err) {
        console.error("Rider create error:", err);
        res.status(500).send({ message: "Failed to submit rider request" });
      }
    });

    //pending riders

    app.get("/riders/pending", verifyFbToken, async (req, res) => {
      try {
        const query = { status: "pending" };
        const result = await riderCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get pending riders" });
      }
    });

    //active riders-->>

    app.get("/riders/active", verifyFbToken, async (req, res) => {
      try {
        const query = { status: "active" };
        const result = await riderCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get active riders" });
      }
    });

    //update (approve) status a rider -->>

    app.patch("/riders/approve/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        // find rider first
        const rider = await riderCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!rider) {
          return res.status(404).send({ message: "Rider not found" });
        }

        const riderUpdate = await riderCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "active",
              approved_at: new Date().toISOString(),
            },
          },
        );

        const userUpdate = await userCollection.updateOne(
          { email: rider.email },
          {
            $set: {
              role: "rider",
            },
          },
        );

        res.send({
          success: true,
          riderUpdate,
          userUpdate,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to approve rider" });
      }
    });

    //reject a rider-->>

    app.patch("/riders/reject/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            status: "rejected",
            rejected_at: new Date().toISOString(),
          },
        };

        const result = await riderCollection.updateOne(query, updateDoc);

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to reject rider" });
      }
    });

    //demote a active rider-->>

    app.patch("/riders/demote/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        const rider = await riderCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!rider) {
          return res.status(404).send({ message: "Rider not found" });
        }

        // rider status active -> pending
        const riderUpdate = await riderCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "pending",
              demoted_at: new Date().toISOString(),
            },
            $unset: {
              approved_at: "",
            },
          },
        );

        // user role rider -> user
        const userUpdate = await userCollection.updateOne(
          { email: rider.email },
          {
            $set: {
              role: "user",
            },
          },
        );

        res.send({
          success: true,
          message:
            "Rider has been changed to normal user and moved to pending.",
          riderUpdate,
          userUpdate,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to demote rider" });
      }
    });

    //payment api-->>
    app.post("/create-payment-intent", verifyFbToken, async (req, res) => {
      try {
        const { cost } = req.body;

        const amount = parseInt(cost * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount,
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

    //save payment and update parcel status-->>

    app.post("/payments", verifyFbToken, async (req, res) => {
      try {
        const paymentData = req.body;

        const parcel = await parcelCollection.findOne({
          _id: new ObjectId(paymentData.parcelId),
        });

        if (!parcel) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        if (parcel.sender.email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const paymentResult = await paymentCollection.insertOne(paymentData);

        const updateDoc = {
          $set: {
            status: "paid",
            transactionId: paymentData.transactionId,
          },
        };

        const updateResult = await parcelCollection.updateOne(
          { _id: new ObjectId(paymentData.parcelId) },
          updateDoc,
        );

        res.send({
          success: true,
          paymentResult,
          updateResult,
        });
      } catch (err) {
        console.error("Payment save error:", err);
        res.status(500).send({ message: "Failed to save payment" });
      }
    });

    //payment history-->>

    app.get("/paymentshistory/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = { email: email };

        const result = await paymentCollection
          .find(query)
          .sort({ paid_at: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Failed to get payment history" });
      }
    });
  } catch (error) {
    console.error("Connection error:", error);
  }
}

run().catch(console.dir);

// Port Listen (Fixed Console Log)
app.listen(port, () => {
  console.log(`Server is running at port: ${port}`);
});
