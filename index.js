const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");

require("dotenv").config();
const port = process.env.PORT || 5500;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.grteoyu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// app

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //   users collection
    const userCollection = client.db("AwsScholars").collection("users");
    const reviewCollection = client.db("AwsScholars").collection("reviews");

    const scholarshipCollection = client
      .db("AwsScholars")
      .collection("scholarships");

    //   USERS RELATED API
    //   post users in db
    app.post("/users", async (req, res) => {
      // INSERT EMAIL IF USER DOESNOT EXIST
      // you can do this in many ways
      // 1. unique email in database 2. upsert 3. simple we will follow the num 3 way in this case

      const user = req.body;
      const query = {
        email: user.email,
      };
      const isUserExist = await userCollection.findOne(query);
      if (isUserExist) {
        return res.send({
          message: "user already exist",

          insertedId: null,
        });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // scholarship related api
    app.get("/top-sholarship", async (req, res) => {
      const result = await scholarshipCollection
        .aggregate([
          // Convert ApplicationDeadline to Date format
          {
            $addFields: {
              postDateISO: {
                $toDate: "$postDate",
              },
            },
          },

          // Sort by both applicationFees and applicationDeadline
          { $sort: { postDateISO: -1, applicationFees: 1 } },
          { $limit: 6 },
        ])
        .toArray();
      res.send(result);
    });
    // get single scholarship data v
    app.get("/scholarships/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      console.log(query, id);
      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    });

    // review related api
    // get top 9
    app.get("/top-reviews", async (req, res) => {
      const result = await reviewCollection
        .aggregate([
          { $sort: { ratingPoint: -1 } }, // Sort by ratingPoint in descending order
          { $limit: 9 }, // Limit to top 9 reviews])
        ])
        .toArray();
      res.send(result);
    });
    app.get();
    app.get("/", (req, res) => {
      res.send("AwsScholars are running");
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
