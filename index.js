const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5001;
const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'https://arzt-praxis.web.app'] }, { credentials: true }));
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("Doctors-chamber API running!");
});

// JWT verification middleware
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("Unauthorized Access!");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      console.log("JWT Verification Error:", err.message);
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}


// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.irpitar.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const appointmentOptionsCollection = client.db("doctors-portal").collection("appointmentOptions");
    const bookingCollection = client.db("doctors-portal").collection("bookings");
    const usersCollection = client.db("doctors-portal").collection("users");
    const doctorsCollection = client.db("doctors-portal").collection("doctors");
    const paymentsCollection = client.db("doctors-portal").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      try {
        const decodedEmail = req.decoded.email;
        const user = await usersCollection.findOne({ email: decodedEmail });
        if (user?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden access" });
        }
        next();
      } catch (error) {
        res.status(500).send({ message: "Error verifying admin", error: error.message });
      }
    };

    // Stripe Payment Intent route
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        const amount = price * 100;  // Price in cents (Stripe uses cents)

        const paymentIntent = await stripe.paymentIntents.create({
          currency: "eur",
          amount: amount,
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ message: "Error creating payment intent", error: error.message });
      }
    });

    // Handle payment
    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        const { bookingId, transactionId } = payment;
        const updatedDoc = {
          $set: { paid: true, transactionId },
        };

        const updatedResult = await bookingCollection.updateOne(
          { _id: ObjectId(bookingId) },
          updatedDoc
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error processing payment", error: error.message });
      }
    });

    // Generate JWT token
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1d" });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "No Access Token" });
    });
    

    app.get("/appointmentOptions", async (req, res) => {
      try {
        const { date } = req.query;
        const options = await appointmentOptionsCollection.find({}).toArray();
        const alreadyBooked = await bookingCollection.find({ appointmentDate: date }).toArray();

        options.forEach(option => {
          const bookedSlots = alreadyBooked
            .filter(book => book.treatment === option.name)
            .map(book => book.slot);
          option.slots = option.slots.filter(slot => !bookedSlots.includes(slot));
        });

        res.send(options);
      } catch (error) {
        res.status(500).send({ message: "Error fetching appointment options", error: error.message });
      }
    });

    app.get("/appointmentSpeciality", async (req, res) => {
      const query = {};
      const result = await appointmentOptionsCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.post("/bookings",verifyJWT, async (req, res) => {
      try {
        const booking = req.body;
        const query = {
          appointmentDate: booking.appointmentDate,
          email: booking.email,
          treatment: booking.treatment,
        };

        const alreadyBooked = await bookingCollection.find(query).toArray();
        if (alreadyBooked.length) {
          return res.status(400).send({ message: `You already have a booking on ${booking.appointmentDate}` });
        }

        const result = await bookingCollection.insertOne(booking);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error booking appointment", error: error.message });
      }
    });

    app.get("/bookings/:id", verifyJWT, async (req, res) => {
      try {
        const decodedEmail = req.decoded.email; 
        const bookingId = req.params.id;
    
        const booking = await bookingCollection.findOne({ _id: ObjectId(bookingId) });
    
        if (!booking) {
          return res.status(404).send({ message: "Booking not found" });
        }
    
        if (booking.email !== decodedEmail) {
          return res.status(403).send({ message: "You are not authorized to view this booking" });
        }
    
        res.send(booking);
      } catch (error) {
        console.error("Error fetching booking:", error);
        res.status(500).send({ message: "Error fetching booking", error: error.message });
      }
    });
    
    
app.get("/bookings", verifyJWT, async (req, res) => {
  try {
    const email = req.query.email; 
    const decodedEmail = req.decoded.email; 

    if (email !== decodedEmail) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    const query = { email: email };
    const bookings = await bookingCollection.find(query).toArray();

    res.send(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).send({ message: "Error fetching bookings", error: error.message });
  }
});

    // Users routes
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error creating user", error: error.message });
      }
    });

    app.get("/users", async (req, res) => {
     try {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
      
     } catch (error) {
      res.status(500).send({ message: "Error Fetching users", error: error.message });
     }
    });


    // Admin routes
    app.get("/users/admin/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ isAdmin: user?.role === "admin" });
      } catch (error) {
        res.status(500).send({ message: "Error checking admin", error: error.message });
      }
    });

    app.put("/users/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const user = await usersCollection.findOne(query);
        res.send({ isAdmin: user?.role === "admin" });
      } catch (error) {
        res.status(500).send({ message: "Error promoting user to admin", error: error.message });
      }
    });

    app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;

        const filter = { _id: ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(
          filter,
          updatedDoc,
          options
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error promoting user to admin", error: error.message });
      }
    });

    // Doctor routes
    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      console.log("Doctor data:", req.body);
      try {
        const data = req.body;
        const result = await doctorsCollection.insertOne(data);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error adding doctor", error: error.message });
      }
    });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      console.log("Fetching doctors");
      try {
        const result = await doctorsCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching doctors", error: error.message });
      }
    });

    app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await doctorsCollection.deleteOne({ _id: ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting doctor", error: error.message });
      }
    });

  } finally {
    // Close the MongoDB client connection
  }
}

run().catch(console.log);

app.listen(port, () => console.log(`Doctors Chamber App is running on ${port}`));
