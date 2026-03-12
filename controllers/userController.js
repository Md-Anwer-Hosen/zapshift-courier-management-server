const { ObjectId } = require("mongodb");

const saveUser = async (req, res) => {
  try {
    const { userCollection } = req.app.locals.collections;
    const user = req.body;

    const query = { email: user.email };
    const existingUser = await userCollection.findOne(query);

    if (existingUser) {
      await userCollection.updateOne(query, {
        $set: { last_login: new Date().toISOString() },
      });

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
};

const searchUsers = async (req, res) => {
  try {
    const { userCollection } = req.app.locals.collections;
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
};

const getUserRole = async (req, res) => {
  try {
    const { userCollection } = req.app.locals.collections;
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
};

const makeAdmin = async (req, res) => {
  try {
    const { userCollection } = req.app.locals.collections;
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
};

const removeAdmin = async (req, res) => {
  try {
    const { userCollection } = req.app.locals.collections;
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
};

module.exports = {
  saveUser,
  searchUsers,
  getUserRole,
  makeAdmin,
  removeAdmin,
};
