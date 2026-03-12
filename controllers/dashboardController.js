const getUserDashboardSummary = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const userEmail = req.decoded.email;

    const summaryPromise = parcelCollection
      .aggregate([
        {
          $match: {
            "sender.email": userEmail,
          },
        },
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

    res.send({ summary, recentParcels });
  } catch (err) {
    console.error("Error fetching user dashboard summary:", err);
    res.status(500).send({ message: "Failed to load user dashboard summary" });
  }
};

const getRiderDashboardSummary = async (req, res) => {
  try {
    const { parcelCollection } = req.app.locals.collections;
    const riderEmail = req.decoded.email;

    const parcels = await parcelCollection
      .find({ assigned_rider_email: riderEmail })
      .sort({ assigned_at: -1 })
      .toArray();

    const totalAssigned = parcels.length;

    const activeTasks = parcels.filter((parcel) =>
      ["assigned", "picked_up", "in_transit"].includes(parcel.delivery_status),
    ).length;

    const completedTasks = parcels.filter(
      (parcel) => parcel.delivery_status === "delivered",
    ).length;

    const totalEarnings = parcels
      .filter((parcel) => parcel.delivery_status === "delivered")
      .reduce(
        (sum, parcel) => sum + Math.round((parcel.deliveryCost || 0) * 0.3),
        0,
      );

    const availableBalance = parcels
      .filter(
        (parcel) =>
          parcel.delivery_status === "delivered" &&
          parcel.isCashoutIncluded !== true,
      )
      .reduce(
        (sum, parcel) => sum + Math.round((parcel.deliveryCost || 0) * 0.3),
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
    res.status(500).send({ message: "Failed to load rider dashboard summary" });
  }
};

const getAdminDashboardSummary = async (req, res) => {
  try {
    const {
      userCollection,
      parcelCollection,
      paymentCollection,
      riderCollection,
    } = req.app.locals.collections;

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
    res.status(500).send({ message: "Failed to load admin dashboard summary" });
  }
};

module.exports = {
  getUserDashboardSummary,
  getRiderDashboardSummary,
  getAdminDashboardSummary,
};
