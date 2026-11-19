import dns from "node:dns/promises";

dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.z0jqk.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Escape regex special characters so input like "(" or "+" can't break the query
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function run() {
  try {
    await client.connect();

    const db = client.db("snitch");

    // Collections
    const productCollection = db.collection("products");

    // Test route
    app.get("/", (req, res) => {
      res.send("Server is running");
    });

    // Test api
    app.get("/api/test", (req, res) => {
      res.json({
        success: true,
        message: "API is working!",
      });
    });

    // Load all products
    app.get("/api/products", async (req, res) => {
      try {
        const category = req.query.category;

        let filter = {};

        if (category && category.toLowerCase() !== "all") {
          filter = {
            $or: [{ category: category }, { subcategory: category }],
          };
        }

        const products = await productCollection
          .find(filter)
          .limit(50)
          .toArray();

        res.json({
          success: true,
          count: products.length,
          products,
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          message: "Failed to load products",
        });
      }
    });

    // Search products
    // IMPORTANT: must be declared BEFORE "/api/products/:id",
    // otherwise Express treats "search" as an :id value.
    app.get("/api/products/search", async (req, res) => {
      try {
        const q = (req.query.q || "").toString().trim();

        if (!q) {
          return res.json({ success: true, products: [] });
        }

        const safe = escapeRegex(q);
        const regex = { $regex: safe, $options: "i" };

        const products = await productCollection
          .find({
            $or: [{ name: regex }, { subcategory: regex }, { category: regex }],
          })
          .limit(20)
          .toArray();

        res.json({
          success: true,
          count: products.length,
          products,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Load single product using id
    app.get("/api/products/:id", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid product id" });
        }

        const product = await productCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!product) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }

        res.json(product);
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Confirm MongoDB connection
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB connected successfully!");

    // Start the server only after the DB and all routes are ready
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

run().catch(console.error);
