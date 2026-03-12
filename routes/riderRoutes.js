const express = require("express");
const router = express.Router();

const verifyFbToken = require("../middlewares/verifyFbToken");
const verifyAdmin = require("../middlewares/verifyAdmin");
const verifyRider = require("../middlewares/verifyRider");

const {
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
} = require("../controllers/riderController");

router.post("/rider", verifyFbToken, createRiderRequest);

router.get("/riders/pending", verifyFbToken, verifyAdmin, getPendingRiders);
router.get("/riders/active", verifyFbToken, verifyAdmin, getActiveRiders);
router.patch("/riders/approve/:id", verifyFbToken, verifyAdmin, approveRider);
router.patch("/riders/reject/:id", verifyFbToken, verifyAdmin, rejectRider);
router.patch("/riders/demote/:id", verifyFbToken, verifyAdmin, demoteRider);
router.get("/riders/available", verifyFbToken, verifyAdmin, getAvailableRiders);

router.get("/rider/tasks", verifyFbToken, verifyRider, getRiderTasks);
router.patch("/rider/tasks/:id", verifyFbToken, verifyRider, updateRiderTask);
router.get(
  "/rider/completed-tasks",
  verifyFbToken,
  verifyRider,
  getCompletedTasks,
);

module.exports = router;
