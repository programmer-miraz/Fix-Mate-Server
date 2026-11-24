
import express from "express";
import cors from "cors";
import 'dotenv/config'
import { MongoClient, ObjectId } from "mongodb";

// Express app create
const app = express();
const PORT = 5000;


// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGO_DB_CLIENT_URI);

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


// Default route
app.get("/", (req, res) => {
    res.send("Backend Server is Running!");
});
// services cart home page
app.get("/services", async (req, res) => {
    const result = await services.find({}).toArray()
    res.send(result);
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



app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});



