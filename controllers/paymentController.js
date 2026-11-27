import { ObjectId } from "mongodb";
import { bookings, payments } from "../index.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const createCheckoutSession = async (req, res) => {
  try {
    const { bookingId} = req.body;

    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await bookings.findOne({
      _id: new ObjectId(bookingId),
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (
      booking.status !== "completed" ||
      booking.paymentStatus !== "unpaid"
    ) {
      return res.status(400).json({
        message: "This booking is not eligible for payment",
      });
    }

    if (!Number.isFinite(booking.finalAmount) || booking.finalAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: booking.serviceTitle,
            },
            unit_amount: Math.round(booking.finalAmount * 100),
          },
          quantity: 1,
        },
      ],

      customer_email: booking.customerEmail,

      metadata: {
        bookingId: bookingId,
      },

      success_url: `${process.env.CLIENT_URL}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${process.env.CLIENT_URL}/dashboard/payment/cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
};
export const verifyPayment = async (req, res) => {
    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({
                message: "Session ID is required",
            });
        }

        // Step 1: Retrieve Stripe session
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== "paid") {
            return res.status(400).json({
                message: "Payment not completed",
            });
        }

        // Step 2: Get booking ID from Stripe metadata
        const bookingId = session.metadata?.bookingId;

        if (!bookingId || !ObjectId.isValid(bookingId)) {
            return res.status(400).json({
                message: "Invalid booking ID",
            });
        }

        // Step 3: Find booking
        const booking = await bookings.findOne({
            _id: new ObjectId(bookingId),
        });

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        // Step 4: Prevent duplicate payment
        const existingPayment = await payments.findOne({
            sessionId: session.id,
        });

        if (existingPayment) {
            return res.status(200).json({
                success: true,
                message: "Payment already verified",
                payment: existingPayment,
            });
        }

        // Step 5: Create payment data
        const paymentData = {
            bookingId,
            customerEmail: booking.customerEmail,
            customerName:booking.customerName,
            serviceTitle: booking.serviceTitle,
            technicianName: booking.technicianName,
            technicianEmail:booking.technicianEmail,
            amount: session.amount_total / 100,
            currency: session.currency,
            transactionId: session.payment_intent,
            sessionId: session.id,
            status: "paid",
            createdAt: new Date(),
        };

        // Step 6: Save payment
        await payments.insertOne(paymentData);

        // Step 7: Update booking payment status
        await bookings.updateOne(
            { _id: new ObjectId(bookingId) },
            {
                $set: {
                    paymentStatus: "paid",
                    updatedAt: new Date(),
                },
            }
        );

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            payment: paymentData,
        });

    } catch (error) {
        console.error("Payment verification error:", error);

        res.status(500).json({
            message: error.message || "Payment verification failed",
        });
    }
};
export const getCustomerPayments = async (req, res) => {
  try {
    const { email } = req.params;

    const result = await payments
      .find({ customerEmail: email })
      .sort({ paidAt: -1 })
      .toArray();

    res.status(200).json(result);
  } catch (error) {
    console.error("Payment history error:", error);
    res.status(500).json({ message: "Failed to get payment history" });
  }
};

export const stripeWebhook = async (req, res) => {
    let event;

    try {
        const signature = req.headers["stripe-signature"];

        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log("Webhook received!");
        console.log(event.type);

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;

            // Check payment status
            if (session.payment_status !== "paid") {
                return res.status(200).json({ received: true });
            }

            const bookingId = session.metadata?.bookingId;

            if (!bookingId || !ObjectId.isValid(bookingId)) {
                return res.status(400).json({
                    message: "Invalid booking ID",
                });
            }

            // Check existing payment
            const existingPayment = await payments.findOne({
                sessionId: session.id,
            });

            if (!existingPayment) {
                const booking = await bookings.findOne({
                    _id: new ObjectId(bookingId),
                });

                if (!booking) {
                    return res.status(404).json({
                        message: "Booking not found",
                    });
                }

                const paymentData = {
                    bookingId,
                    customerEmail: booking.customerEmail,
                    customerName: booking.customerName,
                    serviceTitle: booking.serviceTitle,
                    technicianName: booking.technicianName,
                    technicianEmail: booking.technicianEmail,
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    transactionId: session.payment_intent,
                    sessionId: session.id,
                    status: "paid",
                    createdAt: new Date(),
                };

                await payments.insertOne(paymentData);
            }

            // Update booking
            await bookings.updateOne(
                { _id: new ObjectId(bookingId) },
                {
                    $set: {
                        paymentStatus: "paid",
                        updatedAt: new Date(),
                    },
                }
            );
        }

        res.status(200).json({ received: true });

    } catch (error) {
        console.error("Webhook Error:", error.message);

        res.status(400).json({
            message: `Webhook Error: ${error.message}`,
        });
    }
};