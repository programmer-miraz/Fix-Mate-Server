
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
const client = new MongoClient(process.env.MONGODB_URI);



// Default route
app.get("/", (req, res) => {
    res.send("Backend Server is Running!");
});

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});



