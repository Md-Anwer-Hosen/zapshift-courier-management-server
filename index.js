const express = require("express");
const cors = require("cors");
const { ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");

const client = require("./db");
const verifyAdmin = require("./middlewares/verifyAdmin");
const verifyFbToken = require("./middlewares/verifyFbToken");
const verifyRider = require("./middlewares/verifyRider");

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

async function run() {
  try {
    await client.connect();

    const userCollection = client.db("zapshiftDB").collection("users");
    const parcelCollection = client.db("zapshiftDB").collection("parcels");
    const paymentCollection = client.db("zapshiftDB").collection("payments");
    const riderCollection = client.db("zapshiftDB").collection("riders");

    app.get("/", (req, res) => {
      res.send("Courier Server Running 🚚");
    });

    // save user in db
    app.post("/users", async (req, res) => {
      try {
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
          role: user.role || "user",
          created_at: user.created_at || new Date().toISOString(),
          last_login: new Date().toISOString(),
        };

        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to save user" });
      }
    });

    // search users
    app.get("/users/search", verifyFbToken, verifyAdmin, async (req, res) => {
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

    // get role by email
    app.get("/users/role/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const user = await userCollection.findOne({ email });

        res.send({ role: user?.role || "user" });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get role" });
      }
    });

    // make admin
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

    // remove admin
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

    // user dashboard
    app.get("/dashboard-summary/user", verifyFbToken, async (req, res) => {
      try {
        const userEmail = req.decoded.email;

        const matchStage = {
          $match: {
            "sender.email": userEmail,
          },
        };

        const summaryPromise = parcelCollection
          .aggregate([
            matchStage,
            {
              $group: {
                _id: null,
                totalParcels: { $sum: 1 },
                unpaidParcels: {
                  $sum: {
                    $cond: [{ $eq: ["$payment_status", "unpaid"] }, 1, 0],
                  },
                },
                paidParcels: {
                  $sum: {
                    $cond: [{ $eq: ["$payment_status", "paid"] }, 1, 0],
                  },
                },
                deliveredParcels: {
                  $sum: {
                    $cond: [{ $eq: ["$delivery_status", "delivered"] }, 1, 0],
                  },
                },
              },
            },
          ])
          .toArray();

        const recentParcelsPromise = parcelCollection
          .find({ "sender.email": userEmail })
          .sort({ creation_date: -1 })
          .limit(5)
          .toArray();

        const [summaryData, recentParcels] = await Promise.all([
          summaryPromise,
          recentParcelsPromise,
        ]);

        const summary = summaryData[0] || {
          totalParcels: 0,
          unpaidParcels: 0,
          paidParcels: 0,
          deliveredParcels: 0,
        };

        res.send({
          summary,
          recentParcels,
        });
      } catch (err) {
        console.error("Error fetching user dashboard summary:", err);
        res
          .status(500)
          .send({ message: "Failed to load user dashboard summary" });
      }
    });

    // rider dashboard
    app.get(
      "/dashboard-summary/rider",
      verifyFbToken,
      verifyRider,
      async (req, res) => {
        try {
          const riderEmail = req.decoded.email;

          const parcels = await parcelCollection
            .find({ assigned_rider_email: riderEmail })
            .sort({ assigned_at: -1 })
            .toArray();

          const totalAssigned = parcels.length;

          const activeTasks = parcels.filter((parcel) =>
            ["assigned", "picked_up", "in_transit"].includes(
              parcel.delivery_status,
            ),
          ).length;

          const completedTasks = parcels.filter(
            (parcel) => parcel.delivery_status === "delivered",
          ).length;

          const totalEarnings = parcels
            .filter((parcel) => parcel.delivery_status === "delivered")
            .reduce(
              (sum, parcel) =>
                sum + Math.round((parcel.deliveryCost || 0) * 0.3),
              0,
            );

          const availableBalance = parcels
            .filter(
              (parcel) =>
                parcel.delivery_status === "delivered" &&
                parcel.isCashoutIncluded !== true,
            )
            .reduce(
              (sum, parcel) =>
                sum + Math.round((parcel.deliveryCost || 0) * 0.3),
              0,
            );

          const recentTasks = parcels.slice(0, 5);

          res.send({
            summary: {
              totalAssigned,
              activeTasks,
              completedTasks,
              totalEarnings,
              availableBalance,
            },
            recentTasks,
          });
        } catch (err) {
          console.error("Error fetching rider dashboard summary:", err);
          res
            .status(500)
            .send({ message: "Failed to load rider dashboard summary" });
        }
      },
    );

    // admin dashboard
    app.get(
      "/dashboard-summary/admin",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const totalUsers = await userCollection.countDocuments();
          const totalParcels = await parcelCollection.countDocuments();
          const totalPayments = await paymentCollection.countDocuments();
          const totalActiveRiders = await riderCollection.countDocuments({
            status: "active",
          });
          const totalPendingRiders = await riderCollection.countDocuments({
            status: "pending",
          });
          const deliveredParcels = await parcelCollection.countDocuments({
            delivery_status: "delivered",
          });
          const paidParcels = await parcelCollection.countDocuments({
            payment_status: "paid",
          });

          const recentParcels = await parcelCollection
            .find()
            .sort({ creation_date: -1 })
            .limit(5)
            .toArray();

          res.send({
            summary: {
              totalUsers,
              totalParcels,
              totalPayments,
              totalActiveRiders,
              totalPendingRiders,
              deliveredParcels,
              paidParcels,
            },
            recentParcels,
          });
        } catch (err) {
          console.error("Error fetching admin dashboard summary:", err);
          res
            .status(500)
            .send({ message: "Failed to load admin dashboard summary" });
        }
      },
    );

    // save parcel
    app.post("/parcels", verifyFbToken, async (req, res) => {
      try {
        const data = req.body;

        data.payment_status = "unpaid";
        data.delivery_status = "not_collected";
        data.creation_date = new Date().toISOString();

        const result = await parcelCollection.insertOne(data);

        res.status(201).send(result);
      } catch (err) {
        console.log("Error inserting parcel :", err);
        res.status(500).send({ message: "Failed to create parcel" });
      }
    });

    // get parcels by sender email
    app.get("/parcels/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required!" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = { "sender.email": email };

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

    // get parcel by id for payment
    app.get("/paymentParcel/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        const query = { _id: new ObjectId(id) };
        const result = await parcelCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        if (result.sender.email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // delete parcel
    app.delete("/parcels/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const parcel = await parcelCollection.findOne(query);

        if (!parcel) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        if (parcel.sender.email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const result = await parcelCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to delete parcel" });
      }
    });

    // track parcel
    app.get("/track-parcel/:trackingId", async (req, res) => {
      try {
        const trackingId = req.params.trackingId;

        const parcel = await parcelCollection.findOne({ trackingId });

        if (!parcel) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        res.send(parcel);
      } catch (err) {
        console.error("Error tracking parcel:", err);
        res.status(500).send({ message: "Failed to track parcel" });
      }
    });

    // create rider request
    app.post("/rider", verifyFbToken, async (req, res) => {
      try {
        const rider = req.body;
        const email = rider.email;

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

    // pending riders
    app.get("/riders/pending", verifyFbToken, verifyAdmin, async (req, res) => {
      try {
        const result = await riderCollection
          .find({ status: "pending" })
          .toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get pending riders" });
      }
    });

    // active riders
    app.get("/riders/active", verifyFbToken, verifyAdmin, async (req, res) => {
      try {
        const result = await riderCollection
          .find({ status: "active" })
          .toArray();
        res.send(result);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to get active riders" });
      }
    });

    // approve rider
    app.patch(
      "/riders/approve/:id",
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

    // reject rider
    app.patch(
      "/riders/reject/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          const result = await riderCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "pending",
                rejected_at: new Date().toISOString(),
              },
            },
          );

          res.send(result);
        } catch (error) {
          console.log(error);
          res.status(500).send({ message: "Failed to reject rider" });
        }
      },
    );

    // demote rider
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

    // parcels for assignment
    app.get(
      "/parcels-for-assignment",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      },
    );

    // available riders
    app.get(
      "/riders/available",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      },
    );

    // assign rider
    app.patch(
      "/parcels/assign/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const parcelId = req.params.id;
          const { riderId, riderName, riderEmail, riderPhone } = req.body;

          const updateDoc = {
            $set: {
              assigned_rider_id: riderId,
              assigned_rider_name: riderName,
              assigned_rider_email: riderEmail,
              assigned_rider_phone: riderPhone,
              assigned_at: new Date().toISOString(),
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
      },
    );

    // rider tasks
    app.get("/rider/tasks", verifyFbToken, verifyRider, async (req, res) => {
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

    // rider update task status
    app.patch(
      "/rider/tasks/:id",
      verifyFbToken,
      verifyRider,
      async (req, res) => {
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
                updated_at: new Date().toISOString(),
              },
            },
          );

          res.send(result);
        } catch (err) {
          console.error("Error updating rider task:", err);
          res.status(500).send({ message: "Failed to update task" });
        }
      },
    );

    // rider completed tasks
    app.get(
      "/rider/completed-tasks",
      verifyFbToken,
      verifyRider,
      async (req, res) => {
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
      },
    );

    // create payment intent
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

    // save payment and update parcel
    app.post("/payments", verifyFbToken, async (req, res) => {
      try {
        const paymentData = req.body;
        paymentData.payment_status = "paid";
        paymentData.created_at = new Date().toISOString();

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

    // payment history
    app.get("/paymentshistory/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const result = await paymentCollection
          .find({ email })
          .sort({ paid_at: -1 })
          .toArray();

        res.send(result);
      } catch (err) {
        console.error("Error:", err);
        res.status(500).send({ message: "Failed to get payment history" });
      }
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Connection error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running at port: ${port}`);
});
