
import express from "express";
import cors from "cors";
import 'dotenv/config'
import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";


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
const users = database.collection("user")
const services = database.collection("services")
export const bookings = database.collection("bookings")
export const payments = database.collection("payments");


// verify token
export const verifyToken = async (req, res, next) => {
    const authHeaders = req.headers.authorization;

    if (!authHeaders) {
        return res.status(401).send({ message: "Unauthorized" });
    }

    try {
        const token = authHeaders.split(" ")[1];

        const JWKS = createRemoteJWKSet(
            new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
        );

        const { payload } = await jwtVerify(token, JWKS);
        console.log("Verified User:", payload);


        next();

    } catch (error) {
        return res.status(401).send({
            message: "Invalid or expired token"
        });
    }
};
/// veryfiCutomer
export const verifyCustomer = (req, res, next) => {
    if (req.user.role !== "customer") {
        return res.status(403).send({
            message: "Forbidden access"
        });
    }

    next();
};




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
app.post("/bookings", verifyToken, verifyCustomer,async (req, res) => {
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
app.get("/bookings/my",verifyToken, verifyCustomer, async (req, res) => {
    const { email } = req.query;

    const result = await bookings.find({
        customerEmail: email
    }).toArray();

    res.send(result);
})

//customer request cencel korte parbe 
app.patch("/bookings/:id/cancel",verifyToken, verifyCustomer, async (req, res) => {
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

// customer paymet history 
// Get customer payment history
app.get("/payments/:email", async (req, res) => {
    try {
        const { email } = req.params;

        const paymentsData = await payments
            .find({ customerEmail: email })
            .sort({ paidAt: -1 })
            .toArray();

        res.status(200).send({
            success: true,
            payments: paymentsData,
        });

    } catch (error) {
        console.error(error);

        res.status(500).send({
            success: false,
            message: "Failed to fetch payment history",
        });
    }
});

/// customer dashboard get api-booking
app.get("/customer-dashboard/:email", async (req, res) => {
    try {
        const { email } = req.params;

        const totalBookings = await bookings.countDocuments({
            customerEmail: email,
        });

        const pendingBookings = await bookings.countDocuments({
            customerEmail: email,
            status: "pending",
        });

        const completedBookings = await bookings.countDocuments({
            customerEmail: email,
            status: "completed",
        });

        const paymentResult = await payments.aggregate([
            {
                $match: {
                    customerEmail: email,
                    paymentStatus: "paid",
                },
            },
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: "$amount" },
                },
            },
        ]).toArray();



        res.status(200).send({
            totalBookings,
            pendingBookings,
            completedBookings,

        });

    } catch (error) {
        console.error(error);

        res.status(500).send({
            message: "Failed to fetch customer dashboard data",
        });
    }
});
/// Technician dashboard api
// Technician Dashboard Statistics
app.get("/technician-dashboard/:email", async (req, res) => {
    try {
        const { email } = req.params;
        // Total services
        const totalServices = await services.countDocuments({
            technicianEmail: email,
        });
        // Approved services
        const approvedServices = await services.countDocuments({
            technicianEmail: email,
            approvalStatus: "approved",
        });

        // Total bookings
        const totalBookings = await bookings.countDocuments({
            technicianEmail: email,
        });

        // Pending bookings
        const pendingBookings = await bookings.countDocuments({
            technicianEmail: email,
            status: "pending",
        });

        // Completed bookings
        const completedBookings = await bookings.countDocuments({
            technicianEmail: email,
            status: "completed",
        });

        // Total earnings from paid payments
        const paymentResult = await payments.aggregate([
            {
                $match: {
                    technicianEmail: email,
                    status: "paid",
                },
            },
            {
                $group: {
                    _id: null,
                    totalEarnings: { $sum: "$amount" },
                },
            },
        ]).toArray();

        const totalEarnings = paymentResult[0]?.totalEarnings || 0;

        res.status(200).send({
            totalServices,
            approvedServices,
            totalBookings,
            pendingBookings,
            completedBookings,
            totalEarnings,
        });

    } catch (error) {
        console.error(error);

        res.status(500).send({
            message: "Failed to fetch technician dashboard data",
        });
    }
});


///Admin role change api
// Get all users
app.get("/admin/users", async (req, res) => {
    try {
        const usersData = await users.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).send(usersData);

    } catch (error) {
        console.error(error);

        res.status(500).send({
            message: "Failed to fetch users",
        });
    }
});



//Admin Update user role-
app.patch("/admin/users/:id/role", async (req, res) => {
    try {
        const { id } = req.params;
        const { role, adminEmail } = req.body;

        const allowedRoles = ["customer", "technician", "admin"];

        if (!allowedRoles.includes(role)) {
            return res.status(400).send({
                message: "Invalid role",
            });
        }

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: "Invalid user ID",
            });
        }

        // Check admin
        const admin = await users.findOne({
            email: adminEmail,
            role: "admin",
        });

        if (!admin) {
            return res.status(403).send({
                message: "Only admin can update user roles",
            });
        }

        // Prevent admin from changing their own role
        const targetUser = await users.findOne({
            _id: new ObjectId(id),
        });

        if (!targetUser) {
            return res.status(404).send({
                message: "User not found",
            });
        }

        if (targetUser.email === adminEmail) {
            return res.status(403).send({
                message: "You cannot change your own role",
            });
        }

        const result = await users.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
        );

        res.status(200).send({
            success: true,
            message: "User role updated successfully",
        });

    } catch (error) {
        console.error(error);

        res.status(500).send({
            message: "Failed to update user role",
        });
    }
});
/// admin technician er service approved or korte parbe
// Admin - Get all services
app.get("/admin/services", async (req, res) => {
    const servicesData = await services
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    res.status(200).send(servicesData);
});
/// admin technician er service approved or korte parbe



// Admin - Update service approval status
// Admin - Update service status
app.patch("/admin/services/:id/status", async (req, res) => {
    const { id } = req.params;
    const { approvalStatus } = req.body;

    const allowedStatus = ["approved", "rejected"];

    if (!allowedStatus.includes(approvalStatus)) {
        return res.status(400).send({
            success: false,
            message: "Invalid approval status",
        });
    }

    if (!ObjectId.isValid(id)) {
        return res.status(400).send({
            success: false,
            message: "Invalid service ID",
        });
    }

    const result = await services.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                approvalStatus,
                updatedAt: new Date(),
            },
        }
    );

    res.status(200).send(result);
});

// Admin - Get all bookings-page
app.get("/admin/bookings", async (req, res) => {
    const bookingsData = await bookings
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    res.status(200).send(bookingsData);
});

// Admin - Get all transactions
app.get("/admin/transactions", async (req, res) => {
    const transactionsData = await payments
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    res.status(200).send(transactionsData);
});

// Admin Dashboard Statistics
app.get("/admin-dashboard", async (req, res) => {

    const totalCustomers = await users.countDocuments({
        role: "customer"
    });

    const totalTechnicians = await users.countDocuments({
        role: "technician"
    });

    const pendingServices = await services.countDocuments({
        approvalStatus: "pending"
    });

    const revenueData = await payments.aggregate([
        { $match: { status: "paid" } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" }
            }
        }
    ]).toArray();

    res.send({
        totalCustomers,
        totalTechnicians,
        pendingServices,
        totalRevenue: revenueData[0]?.totalRevenue || 0
    });
});

// Update User Profile
app.patch("/users/:id", async (req, res) => {
    const { id } = req.params;
    const { name, phone, area, bio, image } = req.body;

    const result = await users.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                name,
                phone,
                area,
                bio,
                image,
                updatedAt: new Date(),
            },
        }
    );

    res.send({
        success: true,
        message: "Profile updated successfully",
        result,
    });
});



app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});





