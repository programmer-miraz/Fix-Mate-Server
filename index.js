
import express from "express";
import cors from "cors";
import 'dotenv/config'
import { MongoClient, ObjectId } from "mongodb";
import Stripe from "stripe";
import paymentRoutes from "./routes/paymentRoutes.js";


// Express app create
const app = express();
const PORT = 5000;


// Middleware
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
);
app.use(express.json());
app.use(
    "/api/payments/webhook",
    express.raw({ type: "application/json" })
);
app.use("/api/payments", paymentRoutes);



// MongoDB connection
const client = new MongoClient(process.env.MONGO_DB_CLIENT_URI);
//payment strip connection
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
const connectedDb = await connectToMongoDB()
const database = connectedDb.db("Fix-mate")
const services = database.collection("services")
export const bookings = database.collection("bookings")
export const payments = database.collection("payments");


// Default route
app.get("/", (req, res) => {
    res.send("Backend Server is Running!");
});

// services cart home page
app.get("/services", async (req, res) => {
    const { search, category, mode, sort } = req.query;

    const query = {};

    // Search by title or category
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } }
        ];
    }

    // Category filter
    if (category) {
        query.category = category;
    }

    // Service mode filter
    if (mode) {
        query.serviceMode = mode;
    }

    // Sorting
    let sortOption = { createdAt: -1 };

    if (sort === "price-asc") {
        sortOption = { basePrice: 1 };
    } else if (sort === "price-desc") {
        sortOption = { basePrice: -1 };
    }

    const result = await services
        .find({
            ...query,
            approvalStatus: "approved",
            isAvailable: true
        })
        .sort(sortOption)
        .toArray();

    res.send(result);
});



// Public service details by id
app.get("/services/:id", async (req, res) => {
    try {
        const result = await services.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!result) {
            return res.status(404).send({ message: "Service not found" });
        }

        res.send(result);
    } catch (error) {
        res.status(400).send({ message: "Invalid service id" });
    }
});

// Technician new service add from 
app.post("/services", async (req, res) => {
    const serviceData = req.body;
    const result = await services.insertOne(serviceData);
    res.send(result);
});

//Technician my-services get all service
app.get("/my-services/:userId", async (req, res) => {
    const userId = req.params.userId;

    const result = await services.find({
        technicianId: userId
    }).toArray();

    res.send(result);
});




// // Technician: turn a service's availability ON / OFF and edit 
app.patch("/services/:id", async (req, res) => {
    try {
        const result = await services.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: req.body }
        );

        res.send(result);
    } catch (error) {
        res.status(400).send({ message: "Update failed" });
    }
});

/// my-services delete 
// Technician: Delete own service
app.delete("/services/:id", async (req, res) => {
    const { id } = req.params;
    const result = await services.deleteOne({
        _id: new ObjectId(id),
    });
    res.send(result)


});


/// customre bookings 
// Create Booking
app.post("/bookings", async (req, res) => {
    try {
        const bookingData = req.body;
        const result = await bookings.insertOne(bookingData);
        res.send(result);

    } catch (error) {
        res.status(500).send({
            success: false,
            message: "Failed to create booking"
        });
    }
});


// Get requestes all bookings for a specific technician
app.get("/bookings", async (req, res) => {

    const { technicianEmail } = req.query;

    if (!technicianEmail) {
        return res.status(400).send({
            message: "Technician email is required",
        });
    }
    const result = await bookings.find({ technicianEmail: technicianEmail })
        .sort({ createdAt: -1 })
        .toArray();

    res.send(result);


});


///  Technician: update a booking (status / final amount)
app.patch("/bookings/:id", async (req, res) => {
    const { id } = req.params;
    const { status, finalAmount } = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid booking ID" });
    }

    const booking = await bookings.findOne({
        _id: new ObjectId(id),
    });

    if (!booking) {
        return res.status(404).send({ message: "Booking not found" });
    }

    const allowedTransitions = {
        requested: ["accepted", "rejected"],
        accepted: ["in-progress"],
        "in-progress": ["completed"],
    };

    if (!allowedTransitions[booking.status]?.includes(status)) {
        return res.status(400).send({ message: "Invalid status transition" });
    }

    if (status === "completed" && (!Number.isFinite(finalAmount) || finalAmount <= 0)) {
        return res.status(400).send({ message: "Valid final amount is required" });
    }

    const updateData = {
        status,
        updatedAt: new Date(),
    };

    if (status === "completed") {
        updateData.finalAmount = finalAmount;
    }

    const result = await bookings.updateOne(
        { _id: new ObjectId(id), status: booking.status },
        { $set: updateData }
    );

    res.send({
        success: true,
        message: "Booking status updated successfully",
    });
});



/// customer my-bookin page
app.get("/bookings/my", async (req, res) => {
    const { email } = req.query;

    const result = await bookings.find({
        customerEmail: email
    }).toArray();

    res.send(result);
})

//customer request cencel korte parbe 
app.patch("/bookings/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    const result = await bookings.updateOne(
        {
            _id: new ObjectId(id),
            customerEmail: email,
            status: "requested",
        },
        {
            $set: {
                status: "cancelled",
                updatedAt: new Date(),
            },
        }
    );

    if (result.matchedCount === 0) {
        return res.status(404).send({
            message: "Booking not found or cannot be cancelled",
        });
    }

    res.send({
        success: true,
        message: "Booking cancelled successfully",
    });
});






app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});



