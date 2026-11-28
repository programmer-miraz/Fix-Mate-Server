import express from "express";

import {
  createCheckoutSession,
  verifyPayment,
  getCustomerPayments,
  stripeWebhook,

} from "../controllers/paymentController.js";
import { verifyCustomer, verifyToken } from "../index.js";

export const router = express.Router();

router.post("/create-checkout-session",verifyToken,verifyCustomer,createCheckoutSession);

router.get("/verify", verifyToken, verifyCustomer, verifyPayment);

router.get("/customer/:email",verifyToken,verifyCustomer,getCustomerPayments);

router.post("/webhook", stripeWebhook);

export default router;