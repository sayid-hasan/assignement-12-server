const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const ImageKit = require("imagekit");
const fs = require("fs");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5500;

// middleware
app.use(cors());
app.use(express.json());

// custom middleware

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

// custom middleware
// custom midlw=eware verify token
const verifytoken = (req, res, next) => {
  // console.log("inside verifytoken middleware", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorised access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  // console.log("get token", token);
  jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorised access" });
    }
    req.decoded = decoded;
    console.log("from verifytoken decoded", decoded);
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //   users collection
    const userCollection = client.db("AwsScholars").collection("users");
    const reviewCollection = client.db("AwsScholars").collection("reviews");
    const paymentCollection = client.db("AwsScholars").collection("payments");
    const appliedScholarshipCollection = client
      .db("AwsScholars")
      .collection("appliedScholarships");

    const scholarshipCollection = client
      .db("AwsScholars")
      .collection("scholarships");

    // custom middleware verifyAdmin
    // verify admin after checking verfytoken
    const verifyadmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log("verify admin ", email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      console.log("inside verifyadmin", isAdmin);
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // jwt related api

    app.post("/jwt", async (req, res) => {
      const userinfo = req.body;
      console.log("inside jwt", userinfo);
      const token = await jwt.sign(userinfo, process.env.ACCESS_SECRET_TOKEN, {
        expiresIn: "4h",
      });
      // console.log(token);

      res.send({ token });
    });

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
    // GET ALL SCHOLARSHIP FOR ALL SCHOALRSHIP PAHGE
    app.get("/allsholarship", async (req, res) => {
      const searchQuery = req.query?.search;
      console.log("from all scholarship", searchQuery);
      const query = {};

      if (searchQuery) {
        query.$or = [
          { scholarshipName: { $regex: searchQuery, $options: "i" } },
          { universityName: { $regex: searchQuery, $options: "i" } },
          { degree: { $regex: searchQuery, $options: "i" } },
        ];
      }

      const result = await scholarshipCollection.find(query).toArray();
      res.send(result);
    });
    // get single scholarship data v
    app.get("/scholarships/:id", verifytoken, async (req, res) => {
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
    // get reviews for specific id
    app.get("/reviews/:id", verifytoken, async (req, res) => {
      const id = req.params.id;
      const query = {
        scholarshipId: id,
      };
      const scholarshipReview = await reviewCollection.find(query).toArray();
      res.send(scholarshipReview);
    });
    // PAYMENT RELATED APIS
    // PAYMENT INTENT
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log("inside paymentIntent", req.body);
      const amount = parseInt(price * 100);
      console.log(amount, "amount inside the intent");

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save payment history
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      console.log(payment);
      const paymentResult = await paymentCollection.insertOne(payment);

      res.send(paymentResult);
    });
    // save applicant details as appliedScholarships
    app.post("/appliedScholarship", async (req, res) => {
      const applieSchoalrshipData = req.body;
      const query = {
        applicantPhone: applieSchoalrshipData.applicantPhone,
        scholarshipId: applieSchoalrshipData.scholarshipId,
      };
      const isExist = await appliedScholarshipCollection.findOne(query);
      if (isExist) {
        return res
          .status(403)
          .send({ message: "Applicant already applied for this schoalrship" });
      }
      console.log(applieSchoalrshipData);
      const result = await appliedScholarshipCollection.insertOne(
        applieSchoalrshipData
      );

      res.send(result);
    });

    // imagekit image Upload getsignature
    app.get("/get-signature", async (req, res) => {
      var imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PK,
        privateKey: process.env.IMAGEKIT_SK,
        urlEndpoint: "https://ik.imagekit.io/sayidImage34/",
      });
      const authenticationParameters =
        await imagekit.getAuthenticationParameters();
      console.log(authenticationParameters);
      res.send(authenticationParameters);
    });

    // admin related apis
    // check if user is admin

    // check admin
    app.get("/users/admin/:email", verifytoken, async (req, res) => {
      const email = req.params.email;
      console.log("inside useAdmin route", req.decoded.email);
      console.log("inside useAdmin params", email);

      if (email !== req.decoded.email) {
        return res.status(401).send({
          message: "Unauthorize access",
        });
      }
      const query = {
        email: email,
      };
      console.log(query);
      const user = await userCollection.findOne(query);
      console.log("inside useAdmin route", user);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

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
