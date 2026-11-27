import express from "express";

import {
  createCheckoutSession,
  verifyPayment,
  getCustomerPayments,
  stripeWebhook,

} from "../controllers/paymentController.js";

export const router = express.Router();

router.post("/create-checkout-session", createCheckoutSession);

router.get("/verify", verifyPayment);

router.get("/customer/:email", getCustomerPayments);
router.post("/webhook", stripeWebhook);


export default router;