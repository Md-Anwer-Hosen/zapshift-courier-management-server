const { ObjectId } = require("mongodb");

const createPaymentIntent = async (req, res) => {
  try {
    const { stripe } = req.app.locals.collections;
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
};

const savePayment = async (req, res) => {
  try {
    const { paymentCollection, parcelCollection } = req.app.locals.collections;
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

    const updateResult = await parcelCollection.updateOne(
      { _id: new ObjectId(paymentData.parcelId) },
      {
        $set: {
          payment_status: "paid",
          transactionId: paymentData.transactionId,
        },
      },
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
};

const getPaymentHistory = async (req, res) => {
  try {
    const { paymentCollection } = req.app.locals.collections;
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
};

module.exports = {
  createPaymentIntent,
  savePayment,
  getPaymentHistory,
};
