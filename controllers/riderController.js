const { ObjectId } = require("mongodb");

const createRiderRequest = async (req, res) => {
  try {
    const { riderCollection } = req.app.locals.collections;
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
};

const getPendingRiders = async (req, res) => {
  try {
    const { riderCollection } = req.app.locals.collections;
    const result = await riderCollection.find({ status: "pending" }).toArray();
    res.send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to get pending riders" });
  }
};

const getActiveRiders = async (req, res) => {
  try {
    const { riderCollection } = req.app.locals.collections;
    const result = await riderCollection.find({ status: "active" }).toArray();
    res.send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to get active riders" });
  }
};

const approveRider = async (req, res) => {
  try {
    const { riderCollection, userCollection } = req.app.locals.collections;
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
};

const rejectRider = async (req, res) => {
  try {
    const { riderCollection } = req.app.locals.collections;
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
};

const demoteRider = async (req, res) => {
  try {
    const { riderCollection, userCollection } = req.app.locals.collections;
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
      message: "Rider has been changed to normal user and moved to pending.",
      riderUpdate,
      userUpdate,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to demote rider" });
  }
};

const getAvailableRiders = async (req, res) => {
  try {
    const { riderCollection } = req.app.locals.collections;
    const { region, district } = req.query;

    const riders = await riderCollection
      .find({
        region,
        district,
        status: "active",
      })
      .toArray();

    res.send(riders);
  } catch (err) {
    console.error("Error fetching riders:", err);
    res.status(500).send({ message: "Failed to fetch riders" });
  }
};

const getRiderTasks = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const riderEmail = req.decoded.email;

    const result = await parcelCollection
      .find({
        assigned_rider_email: riderEmail,
        delivery_status: { $in: ["assigned", "picked_up", "in_transit"] },
      })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error fetching rider tasks:", err);
    res.status(500).send({ message: "Failed to fetch rider tasks" });
  }
};

const updateRiderTask = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
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
};

const getCompletedTasks = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const riderEmail = req.decoded.email;

    const result = await parcelCollection
      .find({
        assigned_rider_email: riderEmail,
        delivery_status: "delivered",
      })
      .sort({ updated_at: -1 })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error fetching completed tasks:", err);
    res.status(500).send({ message: "Failed to fetch completed tasks" });
  }
};

module.exports = {
  createRiderRequest,
  getPendingRiders,
  getActiveRiders,
  approveRider,
  rejectRider,
  demoteRider,
  getAvailableRiders,
  getRiderTasks,
  updateRiderTask,
  getCompletedTasks,
};
