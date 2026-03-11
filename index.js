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

    //admin middlewere-->>

    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded?.email;

        const user = await userCollection.findOne({ email });

        if (!user || user.role !== "admin") {
          return res.status(403).send({ message: "Admin only access" });
        }

        next();
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Admin verification failed" });
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

    //find users-->>

    app.get("/users/search", verifyFbToken, async (req, res) => {
      try {
        const search = req.query.search || "";

        const query = {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        };

        const result = await userCollection
          .find(query)
          .sort({ created_at: -1 })
          .limit(20)
          .toArray();

        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to search users" });
      }
    });

    //find role by email -->>

    app.get(
      "/users/role/:email",
      verifyFbToken,

      async (req, res) => {
        const email = req.params.email;

        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const user = await userCollection.findOne({ email });

        res.send({ role: user?.role });
      },
    );

    //make admin -->>

    app.patch(
      "/users/make-admin/:id",
      verifyFbToken,
      verifyAdmin,

      async (req, res) => {
        try {
          const id = req.params.id;

          const targetUser = await userCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!targetUser) {
            return res.status(404).send({ message: "User not found" });
          }

          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                role: "admin",
                promoted_at: new Date().toISOString(),
              },
            },
          );

          res.send({
            success: true,
            message: "User is now admin",
            result,
          });
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Failed to make admin" });
        }
      },
    );

    //demote admin -->>

    app.patch(
      "/users/remove-admin/:id",
      verifyFbToken,
      verifyAdmin,

      async (req, res) => {
        try {
          const id = req.params.id;

          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                role: "user",
                demoted_at: new Date().toISOString(),
              },
            },
          );

          res.send({
            success: true,
            message: "Admin changed to user",
            result,
          });
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Failed to remove admin" });
        }
      },
    );

    //save percel to db-->>

    app.post("/parcels", verifyFbToken, async (req, res) => {
      try {
        const data = req.body;

        // default status add
        data.payment_status = "unpaid";
        data.delivery_status = "not_collected";

        const result = await parcelCollection.insertOne(data);

        res.status(201).send(result);
      } catch (err) {
        console.log("Error inserting parcel :", err);
        res.status(500).send({ message: "Failed to create parcel" });
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

      const parcel = await parcelCollection.findOne(query); // Agey khuje nite hobe
      if (!parcel) return res.status(404).send({ message: "Parcel not found" });

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

    app.get("/riders/pending", verifyFbToken, verifyAdmin, async (req, res) => {
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

    app.get("/riders/active", verifyFbToken, verifyAdmin, async (req, res) => {
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

    app.patch(
      "/riders/approve/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
              $set: { role: "rider" },
            },
          );

          console.log("userUpdate:", userUpdate);

          res.send({
            success: true,
            riderUpdate,
            userUpdate,
          });
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Failed to approve rider" });
        }
      },
    );

    //reject a rider-->>

    app.patch(
      "/riders/reject/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          const query = { _id: new ObjectId(id) };

          const updateDoc = {
            $set: {
              status: "pending",
              rejected_at: new Date().toISOString(),
            },
          };

          const result = await riderCollection.updateOne(query, updateDoc);

          res.send(result);
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Failed to reject rider" });
        }
      },
    );

    //demote a active rider-->>

    app.patch(
      "/riders/demote/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      },
    );

    //asign a rider-->>

    app.get("/parcels-for-assignment", async (req, res) => {
      try {
        const query = {
          payment_status: "paid",
          delivery_status: "not_collected",
        };

        const parcels = await parcelCollection.find(query).toArray();

        res.send(parcels);
      } catch (err) {
        console.error("Error fetching parcels for assignment:", err);
        res.status(500).send({ message: "Failed to fetch parcels" });
      }
    });

    //available rider-->>

    app.get("/riders/available", async (req, res) => {
      try {
        const { region, district } = req.query;

        const query = {
          region,
          district,
          status: "active",
        };

        const riders = await riderCollection.find(query).toArray();
        res.send(riders);
      } catch (err) {
        console.error("Error fetching riders:", err);
        res.status(500).send({ message: "Failed to fetch riders" });
      }
    });

    //assign a rider-->>

    app.patch("/parcels/assign/:id", async (req, res) => {
      try {
        const parcelId = req.params.id;
        const { riderId, riderName, riderEmail, riderPhone } = req.body;

        const updateDoc = {
          $set: {
            assigned_rider_id: riderId,
            assigned_rider_name: riderName,
            assigned_rider_email: riderEmail,
            assigned_rider_phone: riderPhone,
            assigned_at: new Date(),
            delivery_status: "assigned",
          },
        };

        const result = await parcelCollection.updateOne(
          { _id: new ObjectId(parcelId) },
          updateDoc,
        );

        res.send(result);
      } catch (err) {
        console.error("Error assigning rider:", err);
        res.status(500).send({ message: "Failed to assign rider" });
      }
    });

    //get rider task-->>

    app.get("/rider/tasks", verifyFbToken, async (req, res) => {
      try {
        const riderEmail = req.decoded.email;

        const query = {
          assigned_rider_email: riderEmail,
          delivery_status: { $in: ["assigned", "picked_up", "in_transit"] },
        };

        const result = await parcelCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.error("Error fetching rider tasks:", err);
        res.status(500).send({ message: "Failed to fetch rider tasks" });
      }
    });

    //rideer actions-->>

    app.patch("/rider/tasks/:id", verifyFbToken, async (req, res) => {
      try {
        const parcelId = req.params.id;
        const riderEmail = req.decoded.email;
        const { delivery_status } = req.body;

        const allowedStatuses = ["picked_up", "in_transit", "delivered"];

        if (!allowedStatuses.includes(delivery_status)) {
          return res.status(400).send({ message: "Invalid delivery status" });
        }

        const result = await parcelCollection.updateOne(
          {
            _id: new ObjectId(parcelId),
            assigned_rider_email: riderEmail,
          },
          {
            $set: {
              delivery_status,
              updated_at: new Date(),
            },
          },
        );

        res.send(result);
      } catch (err) {
        console.error("Error updating rider task:", err);
        res.status(500).send({ message: "Failed to update task" });
      }
    });

    //compleate delevaries-->

    app.get("/rider/completed-tasks", verifyFbToken, async (req, res) => {
      try {
        const riderEmail = req.decoded.email;

        const query = {
          assigned_rider_email: riderEmail,
          delivery_status: "delivered",
        };

        const result = await parcelCollection
          .find(query)
          .sort({ updated_at: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.error("Error fetching completed tasks:", err);
        res.status(500).send({ message: "Failed to fetch completed tasks" });
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
        paymentData.payment_status = "paid";
        paymentData.created_at = new Date();

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
            payment_status: "paid",
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
