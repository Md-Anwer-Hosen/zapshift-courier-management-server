const client = require("../db");

const verifyRider = async (req, res, next) => {
  try {
    const email = req.decoded?.email;

    if (!email) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const userCollection = client.db("zapshiftDB").collection("users");
    const user = await userCollection.findOne({ email });

    if (!user || user.role !== "rider") {
      return res.status(403).send({ message: "Rider access only" });
    }

    next();
  } catch (err) {
    console.error("Rider verification failed:", err);
    res.status(500).send({ message: "Server error" });
  }
};

module.exports = verifyRider;
