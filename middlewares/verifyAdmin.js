const client = require("../db");

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded?.email;

    if (!email) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const userCollection = client.db("zapshiftDB").collection("users");
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

module.exports = verifyAdmin;
