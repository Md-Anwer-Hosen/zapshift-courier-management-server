const express = require("express");
const router = express.Router();

const verifyFbToken = require("../middlewares/verifyFbToken");
const verifyAdmin = require("../middlewares/verifyAdmin");

const {
  saveUser,
  searchUsers,
  getUserRole,
  makeAdmin,
  removeAdmin,
} = require("../controllers/userController");

router.post("/users", saveUser);
router.get("/users/search", verifyFbToken, verifyAdmin, searchUsers);
router.get("/users/role/:email", verifyFbToken, getUserRole);
router.patch("/users/make-admin/:id", verifyFbToken, verifyAdmin, makeAdmin);
router.patch(
  "/users/remove-admin/:id",
  verifyFbToken,
  verifyAdmin,
  removeAdmin,
);

module.exports = router;
