const express = require("express");
const router = express.Router();

const verifyFbToken = require("../middlewares/verifyFbToken");

const {
  createPaymentIntent,
  savePayment,
  getPaymentHistory,
} = require("../controllers/paymentController");

router.post("/create-payment-intent", verifyFbToken, createPaymentIntent);
router.post("/payments", verifyFbToken, savePayment);
router.get("/paymentshistory/:email", verifyFbToken, getPaymentHistory);

module.exports = router;
