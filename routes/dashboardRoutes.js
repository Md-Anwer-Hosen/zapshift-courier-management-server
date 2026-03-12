const express = require("express");
const router = express.Router();

const verifyFbToken = require("../middlewares/verifyFbToken");
const verifyAdmin = require("../middlewares/verifyAdmin");
const verifyRider = require("../middlewares/verifyRider");

const {
  getUserDashboardSummary,
  getRiderDashboardSummary,
  getAdminDashboardSummary,
} = require("../controllers/dashboardController");

router.get("/dashboard-summary/user", verifyFbToken, getUserDashboardSummary);

router.get(
  "/dashboard-summary/rider",
  verifyFbToken,
  verifyRider,
  getRiderDashboardSummary,
);

router.get(
  "/dashboard-summary/admin",
  verifyFbToken,
  verifyAdmin,
  getAdminDashboardSummary,
);

module.exports = router;
