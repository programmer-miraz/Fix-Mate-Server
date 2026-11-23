
import express from "express";
import cors from "cors";
import 'dotenv/config'
import { MongoClient } from "mongodb";

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
app.get("/services",async (req, res) => {
    const result =  await services.find({}).toArray()
    res.send(result);
});

// Technician new service add from 
app.post("/services", async (req, res) => {
    const serviceData = req.body;
    const result = await services.insertOne(serviceData);
    res.send(result);
});
app.post("/job", (req, res) => {
    res.send("Backend Server is Running!");
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});



