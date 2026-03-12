const express = require("express");
const router = express.Router();

const verifyFbToken = require("../middlewares/verifyFbToken");
const verifyAdmin = require("../middlewares/verifyAdmin");

const {
  saveParcel,
  getParcelsByEmail,
  getPaymentParcelById,
  deleteParcel,
  trackParcel,
  getParcelsForAssignment,
  assignRider,
} = require("../controllers/parcelController");

router.post("/parcels", verifyFbToken, saveParcel);
router.get("/parcels/:email", verifyFbToken, getParcelsByEmail);
router.get("/paymentParcel/:id", verifyFbToken, getPaymentParcelById);
router.delete("/parcels/:id", verifyFbToken, deleteParcel);
router.get("/track-parcel/:trackingId", trackParcel);

router.get(
  "/parcels-for-assignment",
  verifyFbToken,
  verifyAdmin,
  getParcelsForAssignment,
);

router.patch("/parcels/assign/:id", verifyFbToken, verifyAdmin, assignRider);

module.exports = router;
