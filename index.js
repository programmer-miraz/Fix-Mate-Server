
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
const connectedDB = await connectToMongoDB()
const database = connectedDB.db("Fix-Mate")
// const users = database.collection("user")


// Default route
app.get("/", (req, res) => {
    res.send("Backend Server is Running!");
});

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});



