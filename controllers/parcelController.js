const { ObjectId } = require("mongodb");

const saveParcel = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
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
};

const getParcelsByEmail = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const email = req.params.email;

    if (!email) {
      return res.status(400).send({ message: "Email is required!" });
    }

    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    const result = await parcelCollection
      .find({ "sender.email": email })
      .sort({ creation_date: -1 })
      .toArray();

    res.send(result);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ message: "Server error" });
  }
};

const getPaymentParcelById = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const id = req.params.id;

    const result = await parcelCollection.findOne({ _id: new ObjectId(id) });

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
};

const deleteParcel = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
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
};

const trackParcel = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
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
};

const getParcelsForAssignment = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;

    const parcels = await parcelCollection
      .find({
        payment_status: "paid",
        delivery_status: "not_collected",
      })
      .toArray();

    res.send(parcels);
  } catch (err) {
    console.error("Error fetching parcels for assignment:", err);
    res.status(500).send({ message: "Failed to fetch parcels" });
  }
};

const assignRider = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
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
};

module.exports = {
  saveParcel,
  getParcelsByEmail,
  getPaymentParcelById,
  deleteParcel,
  trackParcel,
  getParcelsForAssignment,
  assignRider,
};
